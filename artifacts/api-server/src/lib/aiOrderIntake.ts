import OpenAI from "openai";
import {
  db,
  salesDocumentsTable,
  salesDocumentLinesTable,
  emailCorrespondencesTable,
  waAiIntakeLogTable,
  portalContentTable,
  logisticOrdersTable,
} from "@workspace/db";
import { eq, sql, and, gt } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendMail, isSmtpConfigured } from "./mailer.js";
import { sendLogisticOrderNotification } from "./orderNotification.js";

const AI_INTAKE_KEY = "ai_intake_enabled";
const AI_INTAKE_REPLY_WA_KEY = "ai_intake_reply_wa";
const AI_INTAKE_REPLY_EMAIL_KEY = "ai_intake_reply_email";
const AI_INTAKE_VENDOR_FILTER_KEY = "ai_intake_vendor_filter";

export type VendorFilterMode = "all" | "by-service-type";
const DEFAULT_VENDOR_FILTER: VendorFilterMode = "by-service-type";

const DEFAULT_REPLY_WA = `✅ *Terima kasih!*\nPesan Anda telah kami terima dan sedang diproses oleh tim kami.\nDraft penawaran telah dibuat dan akan segera kami konfirmasi.\nNomor Draft: *{docNumber}*`;
const DEFAULT_REPLY_EMAIL_SUBJECT = `[Draft Diterima] {docNumber} — Terima kasih`;
const DEFAULT_REPLY_EMAIL_BODY = `Terima kasih telah menghubungi kami.\n\nPesan Anda telah kami terima dan sedang diproses oleh tim kami. Draft penawaran *{docNumber}* untuk kebutuhan Anda telah dibuat.\n\nTim kami akan segera menghubungi Anda untuk konfirmasi lebih lanjut.\n\nSalam,\nCST Logistics`;

const VALID_TRANSPORT_MODES = ["sea", "air", "land", "multimodal"] as const;
type ValidTransportMode = (typeof VALID_TRANSPORT_MODES)[number];

function toTransportMode(v: string | null | undefined): ValidTransportMode | null {
  if (!v) return null;
  return (VALID_TRANSPORT_MODES as ReadonlyArray<string>).includes(v)
    ? (v as ValidTransportMode)
    : null;
}

function buildOpenAi(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const AI_INTAKE_PROMPT = `You are an order intake assistant for CST Logistics, a freight forwarding company.
Your job is to read an email or WhatsApp message and extract order/freight inquiry data.
Always respond ONLY with valid JSON — no markdown, no code blocks, no explanation.

Extract the following into this JSON structure:
{
  "customerName": string,
  "customerEmail": string | null,
  "customerPhone": string | null,
  "origin": string | null,
  "destination": string | null,
  "transportMode": "sea" | "air" | "land" | "multimodal" | null,
  "cargoDescription": string | null,
  "grossWeight": number | null,
  "volumeCbm": number | null,
  "requiredDate": string | null,
  "notes": string | null,
  "lines": [
    {
      "name": string,
      "description": string | null,
      "quantity": number,
      "unitPrice": number
    }
  ],
  "confidence": "high" | "medium" | "low",
  "isOrderInquiry": boolean
}

Rules:
- Set isOrderInquiry: true only if the message clearly requests freight, logistics, shipping, or customs services. Set false for generic inquiries, complaints, or unrelated messages.
- If customerName is not mentioned, use "Prospective Customer" as placeholder.
- For lines: create at least one line from the service requested. If no price is mentioned, set unitPrice to 0.
  - Example: { "name": "Sea Freight Jakarta - Singapore", "description": "FCL 20ft", "quantity": 1, "unitPrice": 0 }
- requiredDate as ISO string (YYYY-MM-DD) or null.
- grossWeight and volumeCbm as plain numbers or null.
- confidence: "high" if data is clear and complete, "medium" if partial, "low" if very little info.
- Do NOT make up specific prices unless explicitly stated.`;

interface ExtractedOrder {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  origin?: string | null;
  destination?: string | null;
  transportMode?: "sea" | "air" | "land" | "multimodal" | null;
  cargoDescription?: string | null;
  grossWeight?: number | null;
  volumeCbm?: number | null;
  requiredDate?: string | null;
  notes?: string | null;
  lines: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  confidence: "high" | "medium" | "low";
  isOrderInquiry: boolean;
}

export interface AiIntakeResult {
  docId: number;
  docNumber: string;
  customerName: string;
  confidence: string;
}

async function getSettingValue(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select()
      .from(portalContentTable)
      .where(eq(portalContentTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function isAiIntakeEnabled(): Promise<boolean> {
  const val = await getSettingValue(AI_INTAKE_KEY);
  if (val === null) return true;
  return val !== "false";
}

function generateLogisticOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `LOG-${y}${m}${d}-${rand}`;
}

function toShipmentType(mode: string | null | undefined): string {
  switch (mode) {
    case "sea": return "Sea Freight";
    case "air": return "Air Freight";
    case "land": return "Trucking";
    case "multimodal": return "Sea Freight";
    default: return "Sea Freight";
  }
}

async function nextDocNumber(): Promise<string> {
  const prefix = "SQ";
  const year = new Date().getFullYear();
  const pattern = `${prefix}/${year}/%`;
  const [row] = await db
    .select({
      maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(doc_number, '/', 3) AS int)), 0)`,
    })
    .from(salesDocumentsTable)
    .where(sql`doc_number LIKE ${pattern}`);
  const seq = (Number(row?.maxSeq ?? 0) + 1).toString().padStart(5, "0");
  return `${prefix}/${year}/${seq}`;
}

async function extractOrderFromText(content: string): Promise<ExtractedOrder | null> {
  const openai = buildOpenAi();
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: AI_INTAKE_PROMPT },
        {
          role: "user",
          content: `Extract order inquiry data from this message:\n\n${content.slice(0, 4000)}`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as ExtractedOrder;
  } catch (err) {
    logger.warn({ err }, "AI intake: extraction failed");
    return null;
  }
}

async function createDraftQuotation(
  extracted: ExtractedOrder,
  opts: {
    emailCorrespondenceId?: number;
    waPhone?: string;
    fromEmail?: string | null;
  },
): Promise<AiIntakeResult | null> {
  const lines = extracted.lines ?? [];
  if (!lines.length) {
    lines.push({ name: "Layanan Freight", description: null, quantity: 1, unitPrice: 0 });
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const docNumber = await nextDocNumber();

  const notesParts: string[] = [];
  if (extracted.cargoDescription) notesParts.push(`Kargo: ${extracted.cargoDescription}`);
  if (extracted.grossWeight) notesParts.push(`Berat: ${extracted.grossWeight} kg`);
  if (extracted.volumeCbm) notesParts.push(`Volume: ${extracted.volumeCbm} CBM`);
  if (extracted.requiredDate) notesParts.push(`Tgl Dibutuhkan: ${extracted.requiredDate}`);
  if (extracted.notes) notesParts.push(extracted.notes);

  const [doc] = await db
    .insert(salesDocumentsTable)
    .values({
      docNumber,
      kind: "quote",
      status: "draft",
      customerName: extracted.customerName,
      totalAmount: String(subtotal),
      taxAmount: "0",
      grandTotal: String(subtotal),
      amountPaid: "0",
      origin: extracted.origin ?? null,
      destination: extracted.destination ?? null,
      transportMode: toTransportMode(extracted.transportMode),
      notes: notesParts.join("\n") || null,
      aiGenerated: true,
      aiSourceCorrespondenceId: opts.emailCorrespondenceId ?? null,
      aiSourceWaPhone: opts.waPhone ?? null,
    })
    .returning();

  if (!doc) return null;

  for (const line of lines) {
    const sub = line.quantity * line.unitPrice;
    await db.insert(salesDocumentLinesTable).values({
      documentId: doc.id,
      name: line.name,
      description: line.description ?? null,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      subtotal: String(sub),
    });
  }

  if (opts.emailCorrespondenceId != null) {
    await db
      .update(emailCorrespondencesTable)
      .set({ aiProcessed: true, linkedSalesDocId: doc.id })
      .where(eq(emailCorrespondencesTable.id, opts.emailCorrespondenceId));
  }

  logger.info(
    {
      docId: doc.id,
      docNumber,
      customerName: extracted.customerName,
      confidence: extracted.confidence,
    },
    "AI intake: draft quotation created",
  );

  // ── Create a Logistic Order so vendor notifications fire automatically ──
  // Only proceed if we have at least origin + destination (required DB fields).
  const origin = extracted.origin ?? null;
  const destination = extracted.destination ?? null;
  const shipmentType = toShipmentType(extracted.transportMode);
  const phone = opts.waPhone ?? extracted.customerPhone ?? "000000000000";
  const email = opts.fromEmail ?? extracted.customerEmail ?? `${phone}@ai.cstlogistics.id`;
  const now = new Date();
  const jamOrder = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);

  if (origin && destination) {
    try {
      const logOrderNumber = generateLogisticOrderNumber();
      const serviceList = `• ${shipmentType}`;

      const [logOrder] = await db.insert(logisticOrdersTable).values({
        orderNumber: logOrderNumber,
        companyName: "-",
        customerName: extracted.customerName,
        email,
        phone,
        shipmentType,
        origin,
        destination,
        commodity: extracted.cargoDescription ?? null,
        cargoDescription: extracted.cargoDescription ?? null,
        grossWeight: extracted.grossWeight != null ? String(extracted.grossWeight) : null,
        volumeCbm: extracted.volumeCbm != null ? String(extracted.volumeCbm) : null,
        requiredDate: extracted.requiredDate ?? null,
        notes: notesParts.join("\n") || null,
        jamOrder,
        subtotal: "0",
        tax: "0",
        grandTotal: "0",
        status: "New Order",
        source: "ai_intake",
      }).returning();

      if (logOrder) {
        sendLogisticOrderNotification({
          id: logOrder.id,
          orderNumber: logOrderNumber,
          customerName: extracted.customerName,
          companyName: "-",
          email,
          phone,
          shipmentType,
          origin,
          destination,
          commodity: extracted.cargoDescription ?? null,
          cargoDescription: extracted.cargoDescription ?? null,
          grossWeight: extracted.grossWeight ?? null,
          volumeCbm: extracted.volumeCbm ?? null,
          grandTotal: subtotal,
          serviceList,
          requiredDate: extracted.requiredDate ?? null,
          notes: notesParts.join("\n") || null,
          jamOrder,
          createdAt: logOrder.createdAt,
        }).catch((err: unknown) => logger.error({ err }, "AI intake: sendLogisticOrderNotification failed"));

        logger.info(
          { logOrderId: logOrder.id, logOrderNumber, docNumber, shipmentType, origin, destination },
          "AI intake: logistic order created and vendor notifications queued",
        );
      }
    } catch (err) {
      logger.warn({ err, docNumber }, "AI intake: failed to create logistic order (draft quotation still saved)");
    }
  } else {
    logger.info({ docNumber, origin, destination }, "AI intake: skipping logistic order — origin/destination missing from inquiry");
  }

  return {
    docId: doc.id,
    docNumber,
    customerName: extracted.customerName,
    confidence: extracted.confidence,
  };
}

export async function processEmailForAiIntake(
  emailCorrespondenceId: number,
  subject: string,
  body: string,
  fromEmail: string | null,
): Promise<AiIntakeResult | null> {
  if (!(await isAiIntakeEnabled())) return null;

  const content = `Subject: ${subject}\nFrom: ${fromEmail ?? "unknown"}\n\n${body ?? ""}`;
  const extracted = await extractOrderFromText(content);
  if (!extracted) {
    // AI extraction failed (network / parse error) — mark processed so it appears in log
    await db
      .update(emailCorrespondencesTable)
      .set({ aiProcessed: true, aiSkipReason: "ai_error" })
      .where(eq(emailCorrespondencesTable.id, emailCorrespondenceId));
    logger.warn({ emailCorrespondenceId }, "AI intake: email extraction failed — marked as error");
    return null;
  }
  if (!extracted.isOrderInquiry) {
    // AI decided not an order inquiry — mark processed so it appears in log as skipped
    await db
      .update(emailCorrespondencesTable)
      .set({ aiProcessed: true, aiSkipReason: "not_order_inquiry" })
      .where(eq(emailCorrespondencesTable.id, emailCorrespondenceId));
    logger.debug({ emailCorrespondenceId }, "AI intake: email not classified as order inquiry");
    return null;
  }
  const result = await createDraftQuotation(extracted, { emailCorrespondenceId, fromEmail });
  if (result && fromEmail) {
    try {
      const settings = await getAiIntakeSettings();
      if (settings.replyEmailSubject && settings.replyEmailBody && isSmtpConfigured()) {
        const replySubject = settings.replyEmailSubject.replace(/\{docNumber\}/g, result.docNumber);
        const replyBody = settings.replyEmailBody.replace(/\{docNumber\}/g, result.docNumber);
        await sendMail({
          to: fromEmail,
          subject: replySubject,
          text: replyBody,
          html: replyBody.replace(/\n/g, "<br>"),
        });
        logger.info({ docNumber: result.docNumber, to: fromEmail }, "AI intake: email auto-reply sent");
      }
    } catch (err) {
      logger.warn({ err }, "AI intake: failed to send email auto-reply");
    }
  }
  return result;
}

export async function processWaForAiIntake(
  phone: string,
  message: string,
  senderName?: string | null,
): Promise<AiIntakeResult | null> {
  if (!(await isAiIntakeEnabled())) return null;

  // Idempotency: skip if a draft from same phone was created in the last 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const [recent] = await db
    .select({ id: salesDocumentsTable.id })
    .from(salesDocumentsTable)
    .where(
      and(
        eq(salesDocumentsTable.aiSourceWaPhone, phone),
        gt(salesDocumentsTable.createdAt, tenMinutesAgo),
      ),
    )
    .limit(1);
  if (recent) {
    logger.info({ phone, existingDocId: recent.id }, "AI intake: duplicate WA skipped (recent draft exists)");
    return null;
  }

  const content = `From: ${senderName ?? phone}\nPhone: ${phone}\n\n${message}`;
  const extracted = await extractOrderFromText(content);
  if (!extracted) {
    // AI extraction failed — write a skip/error event so it appears in the intake log
    await db.insert(waAiIntakeLogTable).values({
      phone,
      senderName: senderName ?? null,
      status: "error",
      skipReason: "ai_error",
    });
    logger.warn({ phone }, "AI intake: WA extraction failed — logged as error");
    return null;
  }
  if (!extracted.isOrderInquiry) {
    // AI decided not an order inquiry — write a skipped event for the log
    await db.insert(waAiIntakeLogTable).values({
      phone,
      senderName: senderName ?? null,
      status: "skipped",
      skipReason: "not_order_inquiry",
    });
    logger.debug({ phone }, "AI intake: WA message not classified as order inquiry");
    return null;
  }
  return createDraftQuotation(extracted, { waPhone: phone });
}

export async function getAiIntakeSettings(): Promise<{
  enabled: boolean;
  replyWaTemplate: string;
  replyEmailSubject: string;
  replyEmailBody: string;
  vendorFilterMode: VendorFilterMode;
}> {
  const [enabled, replyWa, replyEmailSubj, replyEmailBody, vendorFilter] = await Promise.all([
    getSettingValue(AI_INTAKE_KEY),
    getSettingValue(AI_INTAKE_REPLY_WA_KEY),
    getSettingValue(AI_INTAKE_REPLY_EMAIL_KEY + "_subject"),
    getSettingValue(AI_INTAKE_REPLY_EMAIL_KEY + "_body"),
    getSettingValue(AI_INTAKE_VENDOR_FILTER_KEY),
  ]);
  return {
    enabled: enabled === null ? true : enabled !== "false",
    replyWaTemplate: replyWa ?? DEFAULT_REPLY_WA,
    replyEmailSubject: replyEmailSubj ?? DEFAULT_REPLY_EMAIL_SUBJECT,
    replyEmailBody: replyEmailBody ?? DEFAULT_REPLY_EMAIL_BODY,
    vendorFilterMode: (vendorFilter === "all" || vendorFilter === "by-service-type")
      ? vendorFilter
      : DEFAULT_VENDOR_FILTER,
  };
}

export async function getVendorFilterMode(): Promise<VendorFilterMode> {
  const val = await getSettingValue(AI_INTAKE_VENDOR_FILTER_KEY);
  return (val === "all" || val === "by-service-type") ? val : DEFAULT_VENDOR_FILTER;
}

export async function saveAiIntakeSettings(settings: {
  enabled: boolean;
  replyWaTemplate?: string;
  replyEmailSubject?: string;
  replyEmailBody?: string;
  vendorFilterMode?: VendorFilterMode;
}): Promise<void> {
  const upsert = async (key: string, value: string) => {
    await db
      .insert(portalContentTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: portalContentTable.key,
        set: { value, updatedAt: new Date() },
      });
  };
  await upsert(AI_INTAKE_KEY, settings.enabled ? "true" : "false");
  if (settings.replyWaTemplate !== undefined)
    await upsert(AI_INTAKE_REPLY_WA_KEY, settings.replyWaTemplate);
  if (settings.replyEmailSubject !== undefined)
    await upsert(AI_INTAKE_REPLY_EMAIL_KEY + "_subject", settings.replyEmailSubject);
  if (settings.replyEmailBody !== undefined)
    await upsert(AI_INTAKE_REPLY_EMAIL_KEY + "_body", settings.replyEmailBody);
  if (settings.vendorFilterMode !== undefined)
    await upsert(AI_INTAKE_VENDOR_FILTER_KEY, settings.vendorFilterMode);
}

export function buildAiReplyWa(template: string, docNumber: string): string {
  return template.replace(/\{docNumber\}/g, docNumber);
}
