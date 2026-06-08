import { Router, Request, Response } from "express";
import type OpenAI from "openai";
import { getOpenAI } from "../lib/openaiClient.js";
import { db } from "@workspace/db";
import { suppliersTable } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { ilike, eq, and, or, isNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Kamu adalah AI Import Advisor dari CST Logistics — spesialis pengurusan impor dari China ke Indonesia.

ALUR KERJA WAJIB — ikuti urutan ini:
1. Saat customer menyebut "mau import" / "impor" / "kirim dari China" → SEGERA panggil request_documents
2. Saat commodity/barang sudah diketahui → panggil lookup_hs_code
3. Setelah punya info cukup (barang + rute + moda) → panggil generate_import_rfq
4. Setelah RFQ → panggil recommend_vendors
5. Saat tahu estimasi berat/CBM → panggil estimate_cost

ATURAN:
- Bahasa Indonesia sopan dan ringkas
- Jangan tanya satu per satu — panggil tools SEGERA saat info cukup
- Setelah setiap tool selesai: rangkum hasil dalam 1–3 kalimat
- Jika ada beberapa pilihan (moda laut vs udara), tanyakan SEKALI lalu lanjutkan
- Tujuan akhir: customer punya draft RFQ + estimasi biaya yang jelas

PENGETAHUAN:
- Sea Freight China→Indonesia: ±14–35 hari, cocok untuk barang berat/volume besar
- Air Freight China→Indonesia: ±3–7 hari, cocok untuk barang ringan/urgent  
- Bea Masuk umum: 0–25% dari nilai CIF tergantung HS Code
- PPN Impor: 11% dari (Nilai CIF + Bea Masuk)
- PPh Pasal 22: 2.5% (API) atau 7.5% (non-API)
- Dokumen wajib PIB: Packing List, Invoice, B/L atau AWB, COO (untuk tarif preferensial)`;

// ─── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "request_documents",
      description: "Tampilkan checklist dokumen yang dibutuhkan untuk proses impor. WAJIB dipanggil pertama kali saat customer mau impor.",
      parameters: {
        type: "object",
        properties: {
          commodity:  { type: "string", description: "Nama/deskripsi barang yang akan diimpor" },
          origin:     { type: "string", description: "Negara asal (default: China)" },
          mode:       { type: "string", enum: ["sea", "air", "both", "unknown"], description: "Moda pengiriman" },
        },
        required: ["commodity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_hs_code",
      description: "Cari dan sarankan kode HS (Harmonized System / Bea Cukai) untuk komoditas impor.",
      parameters: {
        type: "object",
        properties: {
          commodity: { type: "string", description: "Nama/deskripsi barang" },
          details:   { type: "string", description: "Spesifikasi tambahan: material, fungsi, dimensi, kapasitas (opsional)" },
        },
        required: ["commodity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_import_rfq",
      description: "Buat draft RFQ (Request for Quotation) impor berdasarkan informasi yang sudah dikumpulkan.",
      parameters: {
        type: "object",
        properties: {
          commodity:       { type: "string", description: "Nama barang" },
          origin:          { type: "string", description: "Kota/negara asal" },
          destination:     { type: "string", description: "Kota/negara tujuan (default: Jakarta, Indonesia)" },
          hsCode:          { type: "string", description: "Kode HS (opsional)" },
          estimatedWeight: { type: "number", description: "Estimasi berat total (kg)" },
          estimatedCbm:    { type: "number", description: "Estimasi volume (CBM)" },
          mode:            { type: "string", enum: ["Sea Freight", "Air Freight"], description: "Moda pengiriman" },
          quantity:        { type: "string", description: "Jumlah barang/unit" },
          notes:           { type: "string", description: "Catatan tambahan" },
        },
        required: ["commodity", "origin", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_vendors",
      description: "Rekomendasikan vendor freight forwarder yang aktif untuk rute impor ini.",
      parameters: {
        type: "object",
        properties: {
          mode:   { type: "string", enum: ["Sea Freight", "Air Freight", "Both"], description: "Moda pengiriman" },
          origin: { type: "string", description: "Negara asal barang" },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_cost",
      description: "Hitung estimasi biaya pengiriman impor berdasarkan berat, volume, dan rute.",
      parameters: {
        type: "object",
        properties: {
          mode:      { type: "string", enum: ["Sea Freight", "Air Freight"], description: "Moda pengiriman" },
          origin:    { type: "string", description: "Negara asal" },
          weightKg:  { type: "number", description: "Berat total (kg)" },
          cbm:       { type: "number", description: "Volume (CBM)" },
          commodity: { type: "string", description: "Nama barang (untuk estimasi bea masuk)" },
          hsCode:    { type: "string", description: "Kode HS jika sudah diketahui" },
          invoiceUsd:{ type: "number", description: "Nilai invoice (USD) untuk kalkulasi bea masuk" },
        },
        required: ["mode", "origin"],
      },
    },
  },
];

// ─── Tool Executors ────────────────────────────────────────────────────────────

function execRequestDocuments(args: { commodity: string; origin?: string; mode?: string }) {
  const origin = args.origin ?? "China";
  const mode   = args.mode ?? "unknown";

  const docs = [
    { id: "packing_list", label: "Packing List", desc: "Daftar isi paket dari pengirim — wajib untuk kepabeanan", required: true,  icon: "📋" },
    { id: "invoice",      label: "Commercial Invoice", desc: "Faktur komersial dari supplier China — nilai barang untuk kalkulasi bea masuk", required: true, icon: "🧾" },
    { id: "hs_code",      label: "HS Code",  desc: "Kode tarif bea cukai Indonesia (8 digit) — menentukan tarif bea masuk", required: true, icon: "🏷️" },
    { id: "bl_awb",       label: mode === "air" ? "Airway Bill (AWB)" : "Bill of Lading (B/L)", desc: mode === "air" ? "Dokumen pengangkutan udara dari maskapai" : "Dokumen pengangkutan laut dari pelayaran", required: true, icon: "🚢" },
    { id: "coo",          label: "Certificate of Origin (COO)", desc: "Sertifikat asal barang — wajib untuk tarif preferensial ASEAN-China (ACFTA)", required: false, icon: "📜" },
    { id: "pib",          label: "PIB (Pemberitahuan Impor Barang)", desc: "Dokumen pabean Indonesia — dibuat saat barang tiba, dibantu PPJK/forwarder", required: true, icon: "🇮🇩" },
  ];

  return JSON.stringify({
    step: "documents",
    commodity: args.commodity,
    origin,
    mode,
    checklist: docs,
    tips: [
      "Minta Packing List & Invoice dalam format PDF atau Excel dari supplier",
      "COO form E dari China memberi diskon tarif ACFTA (0–5% vs normal 5–25%)",
      "PPJK/forwarder akan bantu proses PIB dan kepabeanan setibanya barang",
    ],
  });
}

async function execLookupHsCode(args: { commodity: string; details?: string }): Promise<string> {
  try {
    const openai  = getOpenAI();
    const prompt  = `Berikan 3 kemungkinan kode HS (Harmonized System) Indonesia untuk barang berikut:
Barang: ${args.commodity}
${args.details ? `Detail: ${args.details}` : ""}

Format respons JSON (array of 3):
[
  {"hsCode": "XXXXXXXX", "description": "Deskripsi HS Indonesia", "dutyRate": "X%", "confidence": "high|medium|low", "notes": "catatan singkat"},
  ...
]
Jawab HANYA JSON array, tanpa markdown.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 400,
    });
    const raw = resp.choices[0]?.message?.content?.trim() ?? "[]";
    const suggestions = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return JSON.stringify({ step: "hs_code", commodity: args.commodity, suggestions });
  } catch (e) {
    logger.warn({ err: e }, "HS code lookup error");
    return JSON.stringify({
      step: "hs_code",
      commodity: args.commodity,
      suggestions: [
        { hsCode: "84XX.XX.XX", description: "Mesin dan peralatan mekanis", dutyRate: "0–5%", confidence: "medium", notes: "Perlu verifikasi dengan BTKI 2022" },
      ],
      warning: "Estimasi AI — wajib konfirmasi dengan PPJK atau portal beacukai.go.id",
    });
  }
}

function execGenerateRfq(args: {
  commodity: string; origin: string; destination?: string; hsCode?: string;
  estimatedWeight?: number; estimatedCbm?: number; mode: string;
  quantity?: string; notes?: string;
}) {
  const rfqNumber = `DRAFT-IMP/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const now       = new Date().toISOString().split("T")[0];
  const destination = args.destination ?? "Jakarta, Indonesia";

  const rfq = {
    step:        "rfq",
    rfqNumber,
    createdAt:   now,
    status:      "draft",
    details: {
      commodity:   args.commodity,
      origin:      args.origin,
      destination,
      mode:        args.mode,
      hsCode:      args.hsCode ?? "—",
      weight:      args.estimatedWeight ? `${args.estimatedWeight} kg` : "Belum diketahui",
      volume:      args.estimatedCbm    ? `${args.estimatedCbm} CBM`  : "Belum diketahui",
      quantity:    args.quantity ?? "—",
      notes:       args.notes ?? "",
    },
    nextSteps: [
      "Konfirmasi berat dan volume dengan supplier",
      "Upload Packing List & Invoice dari supplier",
      "Pilih vendor freight forwarder dari rekomendasi",
      "Kirim RFQ ke vendor untuk mendapatkan penawaran harga",
    ],
  };

  return JSON.stringify(rfq);
}

async function execRecommendVendors(args: { mode: string; origin?: string }): Promise<string> {
  try {
    const vendors = await db
      .select({
        id:          suppliersTable.id,
        name:        suppliersTable.name,
        serviceType: suppliersTable.serviceType,
        phone:       suppliersTable.phone,
        email:       suppliersTable.contactEmail,
        eta:         suppliersTable.eta,
        etaDaysMin:  suppliersTable.etaDaysMin,
        etaDaysMax:  suppliersTable.etaDaysMax,
        logo:        suppliersTable.logo,
        note:        suppliersTable.note,
      })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.isActive, true),
          or(
            ilike(suppliersTable.serviceType, "%freight%"),
            ilike(suppliersTable.serviceType, "%logistic%"),
            ilike(suppliersTable.serviceType, "%forwarder%"),
            ilike(suppliersTable.serviceType, "%import%"),
            ilike(suppliersTable.serviceType, "%customs%"),
            ilike(suppliersTable.serviceType, "%pabean%"),
          ),
        ),
      )
      .limit(8);

    if (vendors.length === 0) {
      return JSON.stringify({
        step: "vendors",
        vendors: [],
        note: "Belum ada vendor freight terdaftar di sistem. Tambahkan vendor via menu Pembelian → Vendor.",
      });
    }

    return JSON.stringify({
      step: "vendors",
      mode:    args.mode,
      origin:  args.origin ?? "China",
      vendors: vendors.map((v) => ({
        id:   v.id,
        name: v.name,
        logo: v.logo,
        serviceType: v.serviceType ?? "Freight/Logistik",
        phone: v.phone,
        email: v.email,
        eta:   v.etaDaysMin && v.etaDaysMax
          ? `${v.etaDaysMin}–${v.etaDaysMax} hari`
          : v.eta ?? "Hubungi vendor",
        note: v.note,
      })),
    });
  } catch (e) {
    logger.warn({ err: e }, "recommend vendors error");
    return JSON.stringify({ step: "vendors", vendors: [], error: "Gagal memuat vendor" });
  }
}

function execEstimateCost(args: {
  mode: string; origin: string; weightKg?: number; cbm?: number;
  commodity?: string; hsCode?: string; invoiceUsd?: number;
}) {
  const isSea = args.mode === "Sea Freight";
  const kg    = args.weightKg ?? 0;
  const cbm   = args.cbm ?? 0;

  let freightMin = 0;
  let freightMax = 0;
  let unit       = "";

  if (isSea) {
    if (cbm > 0) {
      const rate = { min: 45, max: 120 };
      freightMin = Math.round(cbm * rate.min);
      freightMax = Math.round(cbm * rate.max);
      unit = `${cbm} CBM × $${rate.min}–$${rate.max}/CBM`;
    } else if (kg > 0) {
      const cbmEst = kg / 500;
      const rate   = { min: 45, max: 120 };
      freightMin = Math.round(cbmEst * rate.min);
      freightMax = Math.round(cbmEst * rate.max);
      unit = `~${cbmEst.toFixed(2)} CBM (dari ${kg} kg) × $${rate.min}–$${rate.max}/CBM`;
    } else {
      return JSON.stringify({
        step: "estimate",
        mode: args.mode,
        error: "Butuh berat (kg) atau volume (CBM) untuk menghitung estimasi Sea Freight",
        hint:  "Minta supplier berikan detail berat dan dimensi paket",
      });
    }
  } else {
    const chargeable = kg > 0 && cbm > 0 ? Math.max(kg, cbm * 167) : (kg || cbm * 167);
    if (chargeable === 0) {
      return JSON.stringify({
        step:  "estimate",
        mode:  args.mode,
        error: "Butuh berat (kg) untuk menghitung estimasi Air Freight",
      });
    }
    const rate = { min: 3, max: 8 };
    freightMin = Math.round(chargeable * rate.min);
    freightMax = Math.round(chargeable * rate.max);
    unit = `${chargeable.toFixed(1)} kg chargeable × $${rate.min}–$${rate.max}/kg`;
  }

  const usdToIdr  = 15800;
  const invoiceUsd = args.invoiceUsd ?? 0;
  const cifUsd    = invoiceUsd + freightMax * 0.1 + (freightMin + freightMax) / 2;

  let taxEstMin = 0;
  let taxEstMax = 0;
  if (invoiceUsd > 0) {
    const bm  = cifUsd * 0.05;
    const ppn = (cifUsd + bm) * 0.11;
    const pph = cifUsd * 0.025;
    taxEstMin = Math.round((bm + ppn + pph) * usdToIdr);
    taxEstMax = Math.round((cifUsd * 0.25 + (cifUsd + cifUsd * 0.25) * 0.11 + cifUsd * 0.025) * usdToIdr * 0.8);
  }

  return JSON.stringify({
    step:     "estimate",
    mode:     args.mode,
    origin:   args.origin,
    currency: "USD",
    freight: {
      min:  freightMin,
      max:  freightMax,
      unit,
      note: "Belum termasuk asuransi, THC, dokumentasi, dan handling",
    },
    customs: invoiceUsd > 0 ? {
      invoiceUsd,
      estimatedBmIdr:  Math.round(invoiceUsd * usdToIdr * 0.05),
      estimatedTaxIdr: { min: taxEstMin, max: taxEstMax },
      note:            "Estimasi kasar — actual tergantung HS Code, COO, dan nilai CIF final",
    } : { note: "Tambahkan nilai invoice (USD) untuk estimasi bea masuk & pajak impor" },
    disclaimer: "Semua angka adalah ESTIMASI. Harga final dikonfirmasi vendor setelah pengajuan RFQ resmi.",
  });
}

// ─── Streaming helper ──────────────────────────────────────────────────────────

async function streamImportChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  res: Response,
): Promise<void> {
  const openai = getOpenAI();

  const sse = (data: object) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };

  let loopCount = 0;
  const chatMessages = [...messages];

  while (loopCount++ < 6) {
    const stream = await openai.chat.completions.create({
      model:       "gpt-4o",
      messages:    chatMessages,
      tools:       TOOLS,
      tool_choice: "auto",
      stream:      true,
      temperature: 0.4,
      max_tokens:  1200,
    });

    let textBuffer = "";
    const toolCallMap: Record<number, { id: string; name: string; arguments: string }> = {};

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        textBuffer += delta.content;
        sse({ type: "delta", text: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallMap[tc.index]) toolCallMap[tc.index] = { id: "", name: "", arguments: "" };
          if (tc.id)               toolCallMap[tc.index].id        += tc.id;
          if (tc.function?.name)   toolCallMap[tc.index].name      += tc.function.name;
          if (tc.function?.arguments) toolCallMap[tc.index].arguments += tc.function.arguments;
        }
      }
    }

    const pending = Object.values(toolCallMap).filter((tc) => tc.name);

    if (pending.length === 0) {
      sse({ type: "done" });
      return;
    }

    chatMessages.push({
      role:       "assistant",
      content:    textBuffer || null,
      tool_calls: pending.map((tc) => ({
        id:       tc.id,
        type:     "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    for (const tc of pending) {
      let result = "";
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.arguments || "{}"); } catch {}

      sse({ type: "tool_start", name: tc.name, args });

      try {
        if (tc.name === "request_documents") {
          result = execRequestDocuments(args as Parameters<typeof execRequestDocuments>[0]);
        } else if (tc.name === "lookup_hs_code") {
          result = await execLookupHsCode(args as Parameters<typeof execLookupHsCode>[0]);
        } else if (tc.name === "generate_import_rfq") {
          result = execGenerateRfq(args as Parameters<typeof execGenerateRfq>[0]);
        } else if (tc.name === "recommend_vendors") {
          result = await execRecommendVendors(args as Parameters<typeof execRecommendVendors>[0]);
        } else if (tc.name === "estimate_cost") {
          result = execEstimateCost(args as Parameters<typeof execEstimateCost>[0]);
        } else {
          result = JSON.stringify({ error: "Unknown tool" });
        }
      } catch (e: unknown) {
        result = JSON.stringify({ error: String(e) });
      }

      const parsed = (() => { try { return JSON.parse(result); } catch { return null; } })();
      sse({ type: "tool_result", name: tc.name, data: parsed ?? result });

      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }

    chatMessages.push(...toolResults);
  }

  sse({ type: "done" });
}

// ─── Routes ────────────────────────────────────────────────────────────────────

router.post("/chat", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { messages } = req.body as { messages?: OpenAI.Chat.ChatCompletionMessageParam[] };

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const fullMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  try {
    await streamImportChat(fullMessages, res);
  } catch (e: unknown) {
    logger.error({ err: e }, "importAdvisor chat error");
    res.write(`data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
