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
Extract structured data from the uploaded document (invoice, purchase order, quotation, or freight/shipment document).
Always respond ONLY with valid JSON. Do not include markdown, code blocks, or any explanatory text.
The JSON must match one of these schemas based on document type:

For invoice/quotation/sales order/purchase order:
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

For freight/shipment:
{
  "docType": "freight",
  "shipmentNumber": string | null,
  "origin": string | null,
  "destination": string | null,
  "carrier": string | null,
  "weight": number | null,
  "volume": number | null,
  "estimatedCost": number | null,
  "notes": string | null,
  "partyName": string | null,
  "lines": []
}

Rules:
- Extract all monetary values as plain numbers (no currency symbols)
- Dates as ISO strings (YYYY-MM-DD) or null if not found
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
