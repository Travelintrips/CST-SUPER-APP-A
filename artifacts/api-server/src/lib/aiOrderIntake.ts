import OpenAI from "openai";
import {
  db,
  salesDocumentsTable,
  salesDocumentLinesTable,
  emailCorrespondencesTable,
  portalContentTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendMail, isSmtpConfigured } from "./mailer.js";

const AI_INTAKE_KEY = "ai_intake_enabled";
const AI_INTAKE_REPLY_WA_KEY = "ai_intake_reply_wa";
const AI_INTAKE_REPLY_EMAIL_KEY = "ai_intake_reply_email";

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
  if (!extracted || !extracted.isOrderInquiry) {
    logger.debug({ emailCorrespondenceId }, "AI intake: email not classified as order inquiry");
    return null;
  }
  const result = await createDraftQuotation(extracted, { emailCorrespondenceId });
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

  const content = `From: ${senderName ?? phone}\nPhone: ${phone}\n\n${message}`;
  const extracted = await extractOrderFromText(content);
  if (!extracted || !extracted.isOrderInquiry) {
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
}> {
  const [enabled, replyWa, replyEmailSubj, replyEmailBody] = await Promise.all([
    getSettingValue(AI_INTAKE_KEY),
    getSettingValue(AI_INTAKE_REPLY_WA_KEY),
    getSettingValue(AI_INTAKE_REPLY_EMAIL_KEY + "_subject"),
    getSettingValue(AI_INTAKE_REPLY_EMAIL_KEY + "_body"),
  ]);
  return {
    enabled: enabled === null ? true : enabled !== "false",
    replyWaTemplate: replyWa ?? DEFAULT_REPLY_WA,
    replyEmailSubject: replyEmailSubj ?? DEFAULT_REPLY_EMAIL_SUBJECT,
    replyEmailBody: replyEmailBody ?? DEFAULT_REPLY_EMAIL_BODY,
  };
}

export async function saveAiIntakeSettings(settings: {
  enabled: boolean;
  replyWaTemplate?: string;
  replyEmailSubject?: string;
  replyEmailBody?: string;
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
}

export function buildAiReplyWa(template: string, docNumber: string): string {
  return template.replace(/\{docNumber\}/g, docNumber);
}
