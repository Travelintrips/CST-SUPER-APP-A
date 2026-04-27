import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import { requireAdmin } from "../lib/requireAdmin.js";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
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
  "airline": string | null,
  "flightNo": string | null,
  "flightDate": string | null,
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
- For airport fields, prefer "City Name (IATA-CODE)" format, e.g., "Jakarta (CGK)" or just the IATA code if city is unknown
- AWB number format: "XXX-XXXXXXX" (3-digit airline prefix + 7 or 8-digit serial), e.g., "081-12345678" or "157-43470523"
- For shipper/consignee, copy the FULL name including company designation (PT., Pte. Ltd., Co. Ltd., etc.) and address as it appears
- For commodity, summarize the goods description briefly (e.g., "Electronic equipment", "Garments", "Spare parts")
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

    if (isPdf) {
      const base64Pdf = file.buffer.toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all data from this document and return as JSON only.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
            ],
          },
        ],
      });
      extractedText = response.choices[0]?.message?.content ?? "{}";
    } else {
      const base64Image = file.buffer.toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all data from this document image and return as JSON only.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
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
      res.status(422).json({ message: "Could not parse extracted data", raw: cleanedText });
      return;
    }

    res.json({ data: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: "Extraction failed", error: msg });
  }
});

export default router;
