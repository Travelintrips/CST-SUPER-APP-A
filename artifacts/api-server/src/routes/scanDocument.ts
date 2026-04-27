import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import { createRequire } from "node:module";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

const require_ = createRequire(import.meta.url);
type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
// pdf-parse v1.1.1 has a self-test loader issue when imported as the package
// root; importing the inner module path skips that and works in CJS+ESM.
const pdfParse = require_("pdf-parse/lib/pdf-parse.js") as PdfParseFn;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Minimum extracted text length to consider a PDF "text-based" (vs scanned image).
// Below this we fall back to vision OCR.
const PDF_TEXT_FAST_PATH_MIN_CHARS = 200;

router.use((req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    if (process.env.NODE_ENV !== "production") {
      const authHeader = req.headers["authorization"];
      const cookieHeader = req.headers["cookie"];
      logger.warn({
        authHeader: authHeader ? authHeader.slice(0, 30) + "..." : "NONE",
        cookieKeys: cookieHeader
          ? cookieHeader.split(";").map(c => c.trim().split("=")[0]).join(", ")
          : "NONE",
      }, "[scan-auth] 401 — no userId from getAuth");
    }
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
});

const SYSTEM_PROMPT = `You are a document data extraction assistant for a business management system (BizPortal).
Extract structured data from the uploaded document. Detect the document type and use the matching schema.
Always respond ONLY with valid JSON. Do not include markdown, code blocks, or any explanatory text.

For invoice/quotation/sales order/purchase order/expense:
{
  "docType": "sales" | "purchase" | "freight",
  "partyName": string,
  "partyEmail": string | null,
  "partyPhone": string | null,
  "partyAddress": string | null,
  "docDate": string | null,
  "dueDate": string | null,
  "notes": string | null,
  "lines": [
    {
      "name": string,
      "description": string | null,
      "quantity": number,
      "unitPrice": number
    }
  ]
}

For freight/shipment documents (Master Air Waybill / MAWB, House Air Waybill / HAWB, Bill of Lading / B/L, Sea Waybill, Delivery Order, Manifest, etc.):
{
  "docType": "freight",
  "awbNumber": string | null,
  "shipperName": string | null,
  "shipperAddress": string | null,
  "consigneeName": string | null,
  "consigneeAddress": string | null,
  "notifyParty": string | null,
  "originAirport": string | null,
  "destinationAirport": string | null,
  "vessel": string | null,
  "voyage": string | null,
  "containerNo": string | null,
  "commodity": string | null,
  "hsCode": string | null,
  "grossWeight": number | null,
  "netWeight": number | null,
  "pieces": number | null,
  "packingType": string | null,
  "dimensions": string | null,
  "measurement": number | null,
  "notes": string | null,
  "partyName": string | null,
  "lines": []
}

Rules:
- Extract all monetary values as plain numbers (no currency symbols)
- Extract all weights, pieces, and volumes as plain numbers (no units like "kg", "pcs", "cbm")
- Dates as ISO strings (YYYY-MM-DD) or null if not found
- For origin/destination of sea freight (B/L): use PORT OF LOADING as originAirport and PORT OF DISCHARGE as destinationAirport (not the shipper's city). Format as "City, Country" e.g. "Nansha, China" or "Jakarta, Indonesia"
- For origin/destination of air freight (AWB/MAWB): use Airport of Departure as originAirport and Airport of Destination as destinationAirport. Prefer "City (IATA)" format e.g. "Jakarta (CGK)". In a MAWB, the 3-letter IATA code printed at top-left (before the carrier code) is the Airport of Destination
- For air freight (AWB/MAWB/HAWB): set "vessel" to the airline/carrier name (e.g., "China Southern Airlines Co., Ltd."), set "voyage" to the flight number (e.g., "CZ8353")
- For sea freight (B/L): set "vessel" to the SHIP/VESSEL NAME from the "VESSEL" row (e.g., "WADI ALRAYAN") — NOT the shipping line/carrier company name. Set "voyage" to the VOYAGE NUMBER from the "VOYAGE NUMBER" field (e.g., "0AUE9S1NC") — NOT the issue date
- For "awbNumber": use the AWB number for air freight, or the B/L number (BILL OF LADING NUMBER) for sea freight
- For "containerNo": list ALL container numbers from the document, comma-separated (e.g., "TCNU7361016, CMAU6579933"). Include seal numbers only if no container numbers are present
- AWB number format: "XXX-XXXXXXX" (3-digit airline prefix + 7 or 8-digit serial), e.g., "081-12345678" or "157-43470523"
- For shipper/consignee, copy the FULL name including company designation (PT., Pte. Ltd., Co. Ltd., etc.) and address as it appears
- For notifyParty: extract the "Notify Party" or "Also Notify" box if present; write "Same as Consignee" if the document states that; leave null if the field is absent from the document
- For commodity, summarize the goods description briefly (e.g., "Electronic equipment", "Garments", "Spare parts")
- For "dimensions": for sea freight FCL/LCL use the CBM value as a string (e.g., "67.57 CBM"), for air freight use piece dimensions (e.g., "52X34X17")
- For "grossWeight": sum all container/package weights if multiple; report as total
- For "measurement": total CBM across all containers/packages
- Set partyName to the shipper or consignee name (whichever is the BizPortal customer side)
- If unsure of docType, default to "sales"
- Use Indonesian or English field values as they appear in the document`;

router.post("/", upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const mimeType = file.mimetype;
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    res.status(400).json({ message: "Only image files (JPG, PNG, WEBP) and PDF are supported" });
    return;
  }

  try {
    let extractedText: string;
    let mode: "pdf-text" | "pdf-vision" | "image-vision" = "image-vision";

    if (isPdf) {
      // Fast path: try local PDF text extraction first.
      // For text-based PDFs (most airline-issued MAWBs/HAWBs/B/Ls), this is
      // 5–10x faster than sending the PDF as an image to a vision model.
      let pdfText = "";
      try {
        const parsedPdf = await pdfParse(file.buffer);
        pdfText = (parsedPdf.text ?? "").trim();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[scan-document] pdf-parse failed, falling back to vision:", msg);
      }

      if (pdfText.length >= PDF_TEXT_FAST_PATH_MIN_CHARS) {
        // Text-based PDF: send extracted text to a faster text-only model.
        mode = "pdf-text";
        const response = await openai.chat.completions.create({
          model: "gpt-5-mini",
          max_completion_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Extract all data from this document and return as JSON only.\n\n----- DOCUMENT TEXT -----\n${pdfText}`,
            },
          ],
        });
        extractedText = response.choices[0]?.message?.content ?? "{}";
      } else {
        // Scanned image PDF (no text layer) — fall back to vision OCR.
        mode = "pdf-vision";
        const base64Pdf = file.buffer.toString("base64");
        const response = await openai.chat.completions.create({
          model: "gpt-5.1",
          max_completion_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract all data from this document and return as JSON only." },
                { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64Pdf}` } },
              ],
            },
          ],
        });
        extractedText = response.choices[0]?.message?.content ?? "{}";
      }
    } else {
      mode = "image-vision";
      const base64Image = file.buffer.toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all data from this document image and return as JSON only." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
      });
      extractedText = response.choices[0]?.message?.content ?? "{}";
    }

    const cleanedText = extractedText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      res.status(422).json({ message: "Could not parse extracted data", raw: cleanedText, mode });
      return;
    }

    res.json({ data: parsed, mode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({
      err: err instanceof Error ? { message: err.message, name: err.name, stack: err.stack?.slice(0, 500) } : String(err),
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "NOT_SET",
      apiKeySet: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    }, "[scan-document] extraction failed");
    res.status(500).json({ message: "Extraction failed", error: msg });
  }
});

export default router;
