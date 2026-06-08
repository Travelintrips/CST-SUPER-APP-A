import { Router } from "express";
import {
  db,
  paymentsTable,
  salesDocumentsTable,
  logisticOrdersTable,
  customersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postPaymentReceived, postSalesInvoice } from "../lib/accounting.js";
import { markSalesInvoiced, recalculatePaymentStatus } from "../lib/services/index.js";
import { transitionLogisticOrderStatus } from "../lib/services/logisticOrderStatusService.js";
import { sendPaymentProofWaLink } from "../lib/paymentProofService.js";

const router = Router();

const PAYLABS_MERCHANT_ID = process.env["PAYLABS_MERCHANT_ID"] ?? "";
const PAYLABS_API_URL =
  process.env["PAYLABS_API_URL"] ?? "https://sit-pay.paylabs.co.id/payment/v2.1/h5/createLink";
const PAYLABS_PUBLIC_KEY = process.env["PAYLABS_PUBLIC_KEY"] ?? "";

/**
 * Normalise a PEM key that was stored with spaces instead of newlines
 * (common when environment variables are set without escaping \n).
 */
function normalizePemKey(raw: string): string {
  if (!raw) return raw;
  // If already has real newlines, return as-is
  if (raw.includes("\n")) return raw;
  // Replace header/footer space separators, then chunk body into 64-char lines
  return raw
    .replace(/-----BEGIN RSA PRIVATE KEY-----\s+/, "-----BEGIN RSA PRIVATE KEY-----\n")
    .replace(/\s+-----END RSA PRIVATE KEY-----/, "\n-----END RSA PRIVATE KEY-----")
    .split("\n")
    .map((line) =>
      line.startsWith("-----")
        ? line
        : (line.replace(/ /g, "").match(/.{1,64}/g) ?? [line]).join("\n"),
    )
    .join("\n");
}

const PAYLABS_PRIVATE_KEY = normalizePemKey(process.env["PAYLABS_PRIVATE_KEY"] ?? "");

function paylabsConfigured(): boolean {
  return !!PAYLABS_MERCHANT_ID && !!PAYLABS_PRIVATE_KEY;
}

function paylabsWebhookConfigured(): boolean {
  return paylabsConfigured() && !!PAYLABS_PUBLIC_KEY;
}

function rsaSign(payload: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(payload);
  return sign.sign(PAYLABS_PRIVATE_KEY, "base64");
}

function rsaVerify(payload: string, signature: string): boolean {
  if (!PAYLABS_PUBLIC_KEY || !signature) return false;
  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(payload);
    return verify.verify(PAYLABS_PUBLIC_KEY, signature, "base64");
  } catch {
    return false;
  }
}

function buildSignaturePayload(
  method: string,
  endpoint: string,
  bodyJson: string,
  timestamp: string,
): string {
  const bodyHash = crypto.createHash("sha256").update(bodyJson).digest("hex").toLowerCase();
  return `${method}:${endpoint}:${bodyHash}:${timestamp}`;
}

function serializePayment(p: typeof paymentsTable.$inferSelect) {
  return {
    ...p,
    amount: Number(p.amount),
    expiredAt: p.expiredAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)).limit(200);
  return res.json(rows.map(serializePayment));
});

router.get("/by-doc/:kind/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const kind = req.params.kind === "sales" ? "sales" : req.params.kind === "purchase" ? "purchase" : null;
  if (!kind || Number.isNaN(id)) return res.status(400).json({ message: "Invalid params" });
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.refId, id))
    .orderBy(desc(paymentsTable.createdAt));
  return res.json(rows.filter((p) => p.refKind === kind).map(serializePayment));
});

router.post("/sales/:id/create-link", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const [doc] = await db.select().from(salesDocumentsTable).where(eq(salesDocumentsTable.id, id));
  if (!doc) return res.status(404).json({ message: "Sales document not found" });
  if (doc.kind !== "order" || doc.status === "cancelled") {
    return res.status(400).json({ message: "Hanya sales order aktif yang bisa dibayar" });
  }

  // Lookup customer phone number for Paylabs (required field)
  let customerPhone = "081234567890"; // fallback
  if (doc.customerId) {
    const [cust] = await db.select({ phone: customersTable.phone }).from(customersTable).where(eq(customersTable.id, doc.customerId));
    if (cust?.phone) customerPhone = cust.phone.replace(/\D/g, ""); // strip non-digits
  }

  const merchantTradeNo = `BIZ-${doc.id}-${Date.now()}`;
  const amount = Number(doc.grandTotal ?? doc.totalAmount);

  if (!paylabsConfigured()) {
    const [created] = await db
      .insert(paymentsTable)
      .values({
        refKind: "sales",
        refId: doc.id,
        refDocNumber: doc.docNumber,
        amount: String(amount),
        status: "pending",
        provider: "paylabs",
        providerMerchantTradeNo: merchantTradeNo,
        paymentUrl: null,
        raw: { simulation: true, reason: "PAYLABS credentials not configured" },
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning();
    return res.status(202).json({
      configured: false,
      message:
        "Paylabs belum terkonfigurasi. Tautan pembayaran simulasi dibuat. Set PAYLABS_MERCHANT_ID, PAYLABS_PRIVATE_KEY, PAYLABS_PUBLIC_KEY untuk produksi.",
      payment: serializePayment(created),
    });
  }

  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "+07:00");
  const baseUrl = (req.headers["x-forwarded-proto"] ?? "https") + "://" + (req.headers.host ?? "");
  const notifyUrl = `${baseUrl}/api/payments/paylabs/webhook`;
  const redirectUrl = `${baseUrl}/sales/orders/${doc.id}`;

  const body = {
    merchantId: PAYLABS_MERCHANT_ID,
    merchantTradeNo,
    requestId,
    amount: amount.toFixed(2),
    productName: `Pembayaran ${doc.docNumber}`,
    notifyUrl,
    redirectUrl,
    phoneNumber: customerPhone,
    expire: 86400,
  };
  const bodyJson = JSON.stringify(body);
  const signaturePayload = buildSignaturePayload("POST", new URL(PAYLABS_API_URL).pathname, bodyJson, timestamp);
  let signature: string;
  try {
    signature = rsaSign(signaturePayload);
  } catch (err: any) {
    return res.status(500).json({ message: "Paylabs signing failed", error: err?.message });
  }

  let paylabsResp: any = null;
  try {
    const r = await fetch(PAYLABS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TIMESTAMP": timestamp,
        "X-SIGNATURE": signature,
        "X-PARTNER-ID": PAYLABS_MERCHANT_ID,
        "X-REQUEST-ID": requestId,
      },
      body: bodyJson,
    });
    paylabsResp = await r.json().catch(() => ({}));
    if (!r.ok || paylabsResp?.errCode !== "0") {
      return res.status(502).json({
        message: "Paylabs error",
        status: r.status,
        response: paylabsResp,
      });
    }
  } catch (err: any) {
    return res.status(502).json({ message: "Paylabs request failed", error: err?.message });
  }

  const [created] = await db
    .insert(paymentsTable)
    .values({
      refKind: "sales",
      refId: doc.id,
      refDocNumber: doc.docNumber,
      amount: String(amount),
      status: "pending",
      provider: "paylabs",
      providerOrderId: paylabsResp?.platformTradeNo ?? null,
      providerMerchantTradeNo: merchantTradeNo,
      paymentUrl: paylabsResp?.url ?? paylabsResp?.h5Url ?? null,
      raw: paylabsResp,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();

  return res.status(201).json({ configured: true, payment: serializePayment(created) });
});

router.post("/paylabs/webhook", async (req, res) => {
  if (!paylabsWebhookConfigured()) {
    return res.status(503).json({
      errCode: "503",
      errMsg: "Paylabs webhook not configured. Set PAYLABS_MERCHANT_ID, PAYLABS_PRIVATE_KEY, and PAYLABS_PUBLIC_KEY.",
    });
  }
  const signature = (req.headers["x-signature"] as string) ?? "";
  const timestamp = (req.headers["x-timestamp"] as string) ?? "";
  const bodyJson = JSON.stringify(req.body ?? {});
  const payload = buildSignaturePayload("POST", "/api/payments/paylabs/webhook", bodyJson, timestamp);
  if (!rsaVerify(payload, signature)) {
    return res.status(401).json({ errCode: "401", errMsg: "Invalid signature" });
  }
  const merchantTradeNo = req.body?.merchantTradeNo as string | undefined;
  if (!merchantTradeNo) return res.status(400).json({ errCode: "400", errMsg: "Missing merchantTradeNo" });
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.providerMerchantTradeNo, merchantTradeNo));
  if (!payment) return res.status(404).json({ errCode: "404", errMsg: "Payment not found" });

  const status: string = req.body?.status ?? "";
  let newStatus: "pending" | "paid" | "expired" | "cancelled" | "failed" = payment.status;
  let paidAt: Date | null = payment.paidAt;
  if (status === "02" || status === "SUCCESS" || status === "PAID") {
    newStatus = "paid";
    paidAt = new Date();
  } else if (status === "03" || status === "EXPIRED") newStatus = "expired";
  else if (status === "04" || status === "CANCELLED") newStatus = "cancelled";
  else if (status === "05" || status === "FAILED") newStatus = "failed";

  await db
    .update(paymentsTable)
    .set({ status: newStatus, paidAt, raw: req.body, updatedAt: new Date() })
    .where(eq(paymentsTable.id, payment.id));

  if (newStatus === "paid" && payment.status !== "paid") {
    if (payment.refKind === "sales") {
      const [salesDoc] = await db.select().from(salesDocumentsTable).where(eq(salesDocumentsTable.id, payment.refId));
      const invoiceResult = await markSalesInvoiced(payment.refId, "paylabs");
      if (invoiceResult.ok && !invoiceResult.alreadySet && salesDoc) {
        void postSalesInvoice({
          salesDocId: salesDoc.id,
          docNumber: salesDoc.docNumber,
          customerName: salesDoc.customerName,
          netAmount: Number(salesDoc.totalAmount),
          taxAmount: Number(salesDoc.taxAmount ?? 0),
          taxAccountId: null,
        });
      }
      void recalculatePaymentStatus(payment.refId, "sales_order").catch(
        (e: unknown) => console.warn("[payments] recalculatePaymentStatus failed (paylabs webhook)", e)
      );
      if (salesDoc?.logisticOrderId && Number(salesDoc.grandTotal) > 0 && Number(payment.amount) >= Number(salesDoc.grandTotal)) {
        void transitionLogisticOrderStatus(salesDoc.logisticOrderId, "Payment Received", {
          source: "paylabs:webhook",
          actorType: "system",
          notes: `Pembayaran lunas via Paylabs (merchantTradeNo: ${merchantTradeNo})`,
        }).catch((e: unknown) => console.warn("auto Payment Received transition failed (Paylabs webhook)", e));
      }
      if (salesDoc) {
        void sendPaymentProofWaLink(salesDoc.id).catch(
          (e: unknown) => console.warn("[payments] sendPaymentProofWaLink failed (paylabs webhook)", e)
        );
      }
    } else if (payment.refKind === "logistic") {
      // Logistic order direct payment — transition to "Payment Received"
      void transitionLogisticOrderStatus(payment.refId, "Payment Received", {
        source: "paylabs:webhook",
        actorType: "system",
        notes: `Pembayaran lunas via Paylabs (merchantTradeNo: ${merchantTradeNo})`,
      }).catch((e: unknown) => console.warn("auto Payment Received transition failed (Paylabs webhook/logistic)", e));
    }
    void postPaymentReceived({
      paymentId: payment.id,
      refKind: payment.refKind,
      refDocNumber: payment.refDocNumber,
      amount: Number(payment.amount),
    });
  }

  return res.json({ errCode: "0", errMsg: "OK" });
});

router.post("/:id/simulate-paid", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  if (!payment) return res.status(404).json({ message: "Payment not found" });
  await db
    .update(paymentsTable)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(eq(paymentsTable.id, id));
  if (payment.status !== "paid") {
    if (payment.refKind === "sales") {
      const [salesDoc2] = await db.select().from(salesDocumentsTable).where(eq(salesDocumentsTable.id, payment.refId));
      const invoiceResult2 = await markSalesInvoiced(payment.refId, "paylabs");
      if (invoiceResult2.ok && !invoiceResult2.alreadySet && salesDoc2) {
        void postSalesInvoice({
          salesDocId: salesDoc2.id,
          docNumber: salesDoc2.docNumber,
          customerName: salesDoc2.customerName,
          netAmount: Number(salesDoc2.totalAmount),
          taxAmount: Number(salesDoc2.taxAmount ?? 0),
          taxAccountId: null,
        });
      }
      void recalculatePaymentStatus(payment.refId, "sales_order").catch(
        (e: unknown) => console.warn("[payments] recalculatePaymentStatus failed (simulate-paid)", e)
      );
      if (salesDoc2?.logisticOrderId && Number(salesDoc2.grandTotal) > 0 && Number(payment.amount) >= Number(salesDoc2.grandTotal)) {
        void transitionLogisticOrderStatus(salesDoc2.logisticOrderId, "Payment Received", {
          source: "paylabs:simulate-paid",
          actorType: "admin",
          notes: `Simulasi pembayaran lunas via Paylabs (payment #${payment.id})`,
        }).catch((e: unknown) => console.warn("auto Payment Received transition failed (simulate-paid)", e));
      }
      if (salesDoc2) {
        void sendPaymentProofWaLink(salesDoc2.id).catch(
          (e: unknown) => console.warn("[payments] sendPaymentProofWaLink failed (simulate-paid)", e)
        );
      }
    } else if (payment.refKind === "logistic") {
      void transitionLogisticOrderStatus(payment.refId, "Payment Received", {
        source: "paylabs:simulate-paid",
        actorType: "admin",
        notes: `Simulasi pembayaran lunas via Paylabs (payment #${payment.id})`,
      }).catch((e: unknown) => console.warn("auto Payment Received transition failed (simulate-paid/logistic)", e));
    }
  }
  if (payment.status !== "paid") {
    void postPaymentReceived({
      paymentId: payment.id,
      refKind: payment.refKind,
      refDocNumber: payment.refDocNumber,
      amount: Number(payment.amount),
    });
  }
  const [updated] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
  return res.json(serializePayment(updated));
});

export default router;
