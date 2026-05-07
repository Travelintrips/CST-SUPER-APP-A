import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { db } from "@workspace/db";
import {
  aiChatSessionsTable,
  aiChatMessagesTable,
  logisticOrdersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendLogisticOrderNotification } from "../lib/orderNotification";
import { sendWhatsApp } from "../lib/fonnte";
import { requireAdmin } from "../lib/requireAdmin";
import { logger } from "../lib/logger";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export const aiAgentRouter = Router();

const SYSTEM_PROMPT = `Kamu adalah asisten logistik virtual dari CST Logistics — perusahaan jasa pengiriman dan kepabeanan terkemuka di Indonesia.

Tugasmu:
1. Menyapa pelanggan dengan ramah dan memperkenalkan layanan CST Logistics
2. Menjawab pertanyaan seputar layanan logistik (sea freight, air freight, trucking, customs/pabean)
3. Mengumpulkan informasi pengiriman secara bertahap sebelum membuat order:
   - Nama lengkap pelanggan
   - Nomor WhatsApp (format: 08xx / +62xx)
   - Nama perusahaan (opsional, bisa diisi "-" jika individu)
   - Email (opsional)
   - Jenis pengiriman: Sea Freight, Air Freight, atau Trucking
   - Kota/pelabuhan asal
   - Kota/pelabuhan tujuan
   - Jenis/kategori barang (komoditi)
   - Berat perkiraan (kg) dan/atau volume (CBM) — tanyakan sesuai jenis pengiriman
   - Tanggal pengiriman yang diinginkan
   - Catatan tambahan (opsional)
4. Setelah semua info terkumpul, tampilkan RINGKASAN dan minta konfirmasi sebelum membuat order
5. Setelah pelanggan KONFIRMASI, gunakan tool create_logistic_order untuk membuat order

Aturan:
- Gunakan Bahasa Indonesia yang sopan dan ramah
- Kumpulkan data satu per satu — jangan tanya banyak hal sekaligus
- Jika pelanggan hanya ingin konsultasi/tanya harga, jawab dengan estimasi umum dan undang mereka untuk buat order
- TOLAK SOPAN pertanyaan yang tidak berkaitan dengan layanan logistik/pengiriman
- JANGAN pernah membuat order tanpa konfirmasi eksplisit dari pelanggan
- Nomor order akan diberikan setelah order berhasil dibuat

Layanan yang tersedia:
- Sea Freight (Laut): FCL dan LCL, rute domestik & internasional
- Air Freight (Udara): pengiriman cepat via udara
- Trucking (Darat): CDE, CDD, Fuso, Wingbox, Trailer
- Customs/Pabean: PIB, PEB, dokumen kepabeanan
- Packing & Crating: pengemasan profesional

Untuk harga, sampaikan bahwa harga akan dikonfirmasi oleh tim setelah order dibuat karena tergantung volume, rute, dan kondisi pasar.`;

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_available_services",
      description: "Dapatkan daftar layanan dan jenis pengiriman yang tersedia di CST Logistics",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_logistic_order",
      description: "Buat order logistik baru setelah pelanggan konfirmasi semua detail pengiriman",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Nama lengkap pelanggan" },
          phone: { type: "string", description: "Nomor WhatsApp pelanggan" },
          email: { type: "string", description: "Email pelanggan (opsional)" },
          companyName: { type: "string", description: "Nama perusahaan (pakai '-' jika individu)" },
          shipmentType: {
            type: "string",
            enum: ["Sea Freight", "Air Freight", "Trucking"],
            description: "Jenis pengiriman",
          },
          origin: { type: "string", description: "Kota/pelabuhan asal" },
          destination: { type: "string", description: "Kota/pelabuhan tujuan" },
          commodity: { type: "string", description: "Jenis/kategori barang" },
          cargoDescription: { type: "string", description: "Deskripsi barang lebih detail (opsional)" },
          grossWeight: { type: "number", description: "Berat perkiraan dalam kg (opsional)" },
          volumeCbm: { type: "number", description: "Volume dalam CBM (opsional)" },
          requiredDate: { type: "string", description: "Tanggal pengiriman yang diinginkan (YYYY-MM-DD atau teks bebas)" },
          notes: { type: "string", description: "Catatan tambahan (opsional)" },
        },
        required: ["customerName", "phone", "companyName", "shipmentType", "origin", "destination"],
      },
    },
  },
];

function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `LOG-${y}${m}${d}-${rand}`;
}

function generateSessionToken(): string {
  return randomBytes(20).toString("hex");
}

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  sessionToken: string,
  sessionId: number,
): Promise<string> {
  if (toolName === "get_available_services") {
    return JSON.stringify({
      services: [
        { type: "Sea Freight", description: "FCL & LCL, rute domestik & internasional via kapal", etaDomestic: "3-7 hari", etaInternational: "14-45 hari" },
        { type: "Air Freight", description: "Pengiriman cepat via udara", etaDomestic: "1-2 hari", etaInternational: "3-7 hari" },
        { type: "Trucking", description: "CDE, CDD, Fuso, Wingbox, Trailer untuk pengiriman darat", etaDomestic: "1-5 hari" },
        { type: "Customs/Pabean", description: "Layanan kepabeanan PIB, PEB, dan dokumen impor/ekspor" },
        { type: "Packing & Crating", description: "Pengemasan profesional untuk barang fragile atau heavy lift" },
      ],
      priceInfo: "Harga bervariasi berdasarkan rute, volume, dan kondisi pasar. Tim kami akan menghubungi setelah order dibuat.",
    });
  }

  if (toolName === "create_logistic_order") {
    try {
      const {
        customerName, phone, email, companyName, shipmentType,
        origin, destination, commodity, cargoDescription,
        grossWeight, volumeCbm, requiredDate, notes,
      } = args as {
        customerName: string; phone: string; email?: string; companyName: string;
        shipmentType: string; origin: string; destination: string;
        commodity?: string; cargoDescription?: string; grossWeight?: number;
        volumeCbm?: number; requiredDate?: string; notes?: string;
      };

      const orderNumber = generateOrderNumber();
      const now = new Date();
      const jamOrder = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(now);

      const [order] = await db.insert(logisticOrdersTable).values({
        orderNumber,
        companyName: companyName || "-",
        customerName,
        email: email || `${phone}@wa.cstlogistics.id`,
        phone,
        shipmentType,
        origin,
        destination,
        commodity: commodity ?? null,
        cargoDescription: cargoDescription ?? null,
        grossWeight: grossWeight != null ? String(grossWeight) : null,
        volumeCbm: volumeCbm != null ? String(volumeCbm) : null,
        requiredDate: requiredDate ?? null,
        notes: notes ?? null,
        jamOrder,
        subtotal: "0",
        tax: "0",
        grandTotal: "0",
        status: "New Order",
        source: "ai_agent",
        aiSessionToken: sessionToken,
      }).returning();

      await db.update(aiChatSessionsTable)
        .set({ logisticOrderId: order.id })
        .where(eq(aiChatSessionsTable.id, sessionId));

      const serviceList = `• ${shipmentType}`;

      sendLogisticOrderNotification({
        id: order.id,
        orderNumber,
        customerName,
        companyName: companyName || "-",
        email: email || `${phone}@wa.cstlogistics.id`,
        phone,
        shipmentType,
        origin,
        destination,
        commodity: commodity ?? null,
        cargoDescription: cargoDescription ?? null,
        grossWeight: grossWeight ?? null,
        volumeCbm: volumeCbm ?? null,
        grandTotal: 0,
        serviceList,
        requiredDate: requiredDate ?? null,
        notes: notes ?? null,
        jamOrder,
        createdAt: order.createdAt,
      }).catch((err: unknown) => logger.error({ err }, "AI agent sendLogisticOrderNotification failed"));

      return JSON.stringify({
        success: true,
        orderNumber,
        orderId: order.id,
        message: `Order berhasil dibuat dengan nomor ${orderNumber}. Tim CST Logistics akan segera menghubungi Anda untuk konfirmasi harga.`,
      });
    } catch (err) {
      logger.error({ err }, "AI agent create_logistic_order failed");
      return JSON.stringify({ success: false, error: "Gagal membuat order. Silakan coba lagi atau hubungi kami langsung." });
    }
  }

  return JSON.stringify({ error: "Unknown tool" });
}

async function runAiChat(
  sessionId: number,
  sessionToken: string,
  userMessage: string,
): Promise<{ assistantMessage: string; orderCreated?: { orderNumber: string; orderId: number } }> {
  const existingMessages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, sessionId));

  await db.insert(aiChatMessagesTable).values({
    sessionId,
    role: "user",
    content: userMessage,
  });

  const visibleMessages = existingMessages.filter((m) => m.role === "user" || m.role === "assistant");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...visibleMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  let orderCreated: { orderNumber: string; orderId: number } | undefined;

  let response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools: TOOLS,
    tool_choice: "auto",
    max_completion_tokens: 1000,
  });

  let assistantMsg = response.choices[0]?.message;
  let loopCount = 0;

  while (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0 && loopCount < 5) {
    loopCount++;
    messages.push({ role: "assistant", content: assistantMsg.content ?? null, tool_calls: assistantMsg.tool_calls });

    const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    for (const tc of assistantMsg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* empty */ }
      const result = await handleToolCall(tc.function.name, args, sessionToken, sessionId);

      if (tc.function.name === "create_logistic_order") {
        try {
          const parsed = JSON.parse(result) as { success?: boolean; orderNumber?: string; orderId?: number };
          if (parsed.success && parsed.orderNumber && parsed.orderId) {
            orderCreated = { orderNumber: parsed.orderNumber, orderId: parsed.orderId };
          }
        } catch { /* empty */ }
      }

      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    messages.push(...toolResults);

    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_completion_tokens: 1000,
    });
    assistantMsg = response.choices[0]?.message;
  }

  const finalContent = assistantMsg?.content ?? "Maaf, terjadi kesalahan. Silakan coba lagi.";

  await db.insert(aiChatMessagesTable).values({
    sessionId,
    role: "assistant",
    content: finalContent,
  });

  return { assistantMessage: finalContent, orderCreated };
}

aiAgentRouter.post("/chat", async (req: Request, res: Response) => {
  const { sessionToken: incomingToken, message } = req.body as {
    sessionToken?: string;
    message?: string;
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ message: "Pesan tidak boleh kosong" });
  }

  try {
    let session: typeof aiChatSessionsTable.$inferSelect | undefined;

    if (incomingToken) {
      const [existing] = await db
        .select()
        .from(aiChatSessionsTable)
        .where(eq(aiChatSessionsTable.sessionToken, incomingToken));
      session = existing;
    }

    if (!session) {
      const token = generateSessionToken();
      const [created] = await db
        .insert(aiChatSessionsTable)
        .values({ sessionToken: token })
        .returning();
      session = created;
    }

    const { assistantMessage, orderCreated } = await runAiChat(
      session.id,
      session.sessionToken,
      message.trim(),
    );

    return res.json({
      sessionToken: session.sessionToken,
      message: assistantMessage,
      orderCreated: orderCreated ?? null,
    });
  } catch (err) {
    logger.error({ err }, "AI agent chat error");
    return res.status(500).json({ message: "Terjadi kesalahan pada AI. Silakan coba lagi." });
  }
});

aiAgentRouter.get("/session/:token", async (req: Request, res: Response) => {
  const { token } = req.params;

  const [session] = await db
    .select()
    .from(aiChatSessionsTable)
    .where(eq(aiChatSessionsTable.sessionToken, token));

  if (!session) return res.status(404).json({ message: "Sesi tidak ditemukan" });

  const messages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, session.id));

  return res.json({
    session: {
      id: session.id,
      sessionToken: session.sessionToken,
      logisticOrderId: session.logisticOrderId,
      createdAt: session.createdAt.toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

aiAgentRouter.get("/session/by-order/:orderId", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const [session] = await db
    .select()
    .from(aiChatSessionsTable)
    .where(eq(aiChatSessionsTable.logisticOrderId, orderId));

  if (!session) return res.status(404).json({ message: "Tidak ada sesi chat AI untuk order ini" });

  const messages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, session.id));

  return res.json({
    session: {
      id: session.id,
      sessionToken: session.sessionToken,
      logisticOrderId: session.logisticOrderId,
      createdAt: session.createdAt.toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

aiAgentRouter.post("/session/:token/admin-reply", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const { token } = req.params;
  const { message } = req.body as { message?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ message: "Pesan tidak boleh kosong" });
  }

  const [session] = await db
    .select()
    .from(aiChatSessionsTable)
    .where(eq(aiChatSessionsTable.sessionToken, token));

  if (!session) return res.status(404).json({ message: "Sesi tidak ditemukan" });

  if (session.logisticOrderId) {
    const [order] = await db
      .select()
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, session.logisticOrderId));

    if (order?.phone) {
      const waMsg =
        `📦 *Balasan dari CST Logistics*\n` +
        (order.orderNumber ? `No. Order: ${order.orderNumber}\n\n` : `\n`) +
        message.trim();
      sendWhatsApp(order.phone, waMsg).catch((err: unknown) =>
        logger.error({ err }, "AI agent admin reply WA failed")
      );
    }
  }

  const [saved] = await db.insert(aiChatMessagesTable).values({
    sessionId: session.id,
    role: "admin",
    content: message.trim(),
  }).returning();

  return res.status(201).json({
    id: saved.id,
    role: saved.role,
    content: saved.content,
    createdAt: saved.createdAt.toISOString(),
  });
});
