import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { db } from "@workspace/db";
import {
  aiChatSessionsTable,
  aiChatMessagesTable,
  logisticOrdersTable,
} from "@workspace/db";
import { eq, asc, or, inArray, sql } from "drizzle-orm";
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
6. Jika pelanggan bertanya tentang status order, tracking, posisi paket, kapan tiba, konfirmasi, dll — LANGSUNG panggil tool get_order_status

Aturan:
- Gunakan Bahasa Indonesia yang sopan dan ramah
- Kumpulkan data satu per satu — jangan tanya banyak hal sekaligus
- Jika pelanggan hanya ingin konsultasi/tanya harga, jawab dengan estimasi umum dan undang mereka untuk buat order
- TOLAK SOPAN pertanyaan yang tidak berkaitan dengan layanan logistik/pengiriman
- JANGAN pernah membuat order tanpa konfirmasi eksplisit dari pelanggan
- Nomor order akan diberikan setelah order berhasil dibuat
- WAJIB: Ketika pelanggan menggunakan kata "status", "cek order", "tracking", "mana paket", "sudah dikirim", "posisi", atau hal serupa — panggil get_order_status SEGERA tanpa bertanya nomor HP atau nomor order terlebih dahulu. Tool sudah otomatis tahu sesi ini.
- Setelah get_order_status mengembalikan hasil: WAJIB tulis ringkasan ramah — jangan biarkan respons kosong
- Jika tool mengembalikan found=false: beri tahu pelanggan dan tawarkan untuk mencari dengan nomor WhatsApp mereka

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
      name: "get_order_status",
      description: "Cek status order logistik pelanggan. Otomatis mencari berdasarkan sesi chat ini. Jika pelanggan menyebut nomor WhatsApp lain, gunakan parameter phone.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Nomor WhatsApp pelanggan (opsional, untuk mencari order dari nomor lain)" },
        },
        required: [],
      },
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

  if (toolName === "get_order_status") {
    try {
      const { phone } = args as { phone?: string };

      // Build OR condition: match by current session token, or by phone if provided
      const conditions = [eq(logisticOrdersTable.aiSessionToken, sessionToken)];
      if (phone && phone.trim()) {
        conditions.push(eq(logisticOrdersTable.phone, phone.trim()));
      }

      const orders = await db
        .select({
          id: logisticOrdersTable.id,
          orderNumber: logisticOrdersTable.orderNumber,
          status: logisticOrdersTable.status,
          shipmentType: logisticOrdersTable.shipmentType,
          origin: logisticOrdersTable.origin,
          destination: logisticOrdersTable.destination,
          customerName: logisticOrdersTable.customerName,
          requiredDate: logisticOrdersTable.requiredDate,
          createdAt: logisticOrdersTable.createdAt,
        })
        .from(logisticOrdersTable)
        .where(or(...conditions))
        .orderBy(asc(logisticOrdersTable.createdAt));

      if (orders.length === 0) {
        return JSON.stringify({
          found: false,
          message: "Tidak ada order yang ditemukan untuk sesi ini. Jika Anda memiliki nomor WhatsApp yang terdaftar, silakan sebutkan.",
        });
      }

      // Batch: fetch all sessions for these orders in one query
      const orderIds = orders.map((o) => o.id);
      const sessions = await db
        .select({ id: aiChatSessionsTable.id, logisticOrderId: aiChatSessionsTable.logisticOrderId })
        .from(aiChatSessionsTable)
        .where(inArray(aiChatSessionsTable.logisticOrderId, orderIds));

      // Batch: fetch latest admin reply per session in one query using DISTINCT ON
      const sessionIds = sessions.map((s) => s.id);
      const latestRepliesMap: Record<number, string> = {};
      if (sessionIds.length > 0) {
        const rows = await db.execute<{ session_id: number; content: string }>(sql`
          SELECT DISTINCT ON (session_id) session_id, content
          FROM ${aiChatMessagesTable}
          WHERE session_id = ANY(ARRAY[${sql.join(sessionIds.map((id) => sql`${id}`), sql`, `)}]::int[])
            AND role = 'admin'
          ORDER BY session_id, created_at DESC
        `);
        for (const row of rows.rows) {
          latestRepliesMap[row.session_id] = row.content;
        }
      }

      // Build session → order lookup
      const sessionByOrderId = Object.fromEntries(sessions.map((s) => [s.logisticOrderId, s.id]));

      const enriched = orders.map((order) => {
        const sessionId = sessionByOrderId[order.id];
        const latestAdminReply = sessionId != null ? (latestRepliesMap[sessionId] ?? null) : null;
        return {
          orderNumber: order.orderNumber,
          status: order.status,
          shipmentType: order.shipmentType,
          origin: order.origin,
          destination: order.destination,
          customerName: order.customerName,
          requiredDate: order.requiredDate ?? null,
          createdAt: order.createdAt.toISOString(),
          latestAdminReply,
        };
      });

      return JSON.stringify({ found: true, orders: enriched });
    } catch (err) {
      logger.error({ err }, "AI agent get_order_status failed");
      return JSON.stringify({ found: false, message: "Gagal mengambil status order. Silakan coba lagi." });
    }
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

/** Stream AI chat to an SSE response. Handles tool-call loops internally. */
async function streamAiChat(
  sessionId: number,
  sessionToken: string,
  userMessage: string,
  res: Response,
): Promise<void> {
  function sendEvent(data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const existingMessages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.sessionId, sessionId))
    .orderBy(asc(aiChatMessagesTable.createdAt));

  await db.insert(aiChatMessagesTable).values({
    sessionId,
    role: "user",
    content: userMessage,
  });

  const visibleMessages = existingMessages.filter((m) => m.role === "user" || m.role === "assistant");

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...visibleMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  let finalContent = "";
  let loopCount = 0;

  while (loopCount < 5) {
    loopCount++;

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      tools: TOOLS,
      tool_choice: "auto",
      max_completion_tokens: 1000,
      stream: true,
    });

    // Accumulate tool call deltas by index.
    // Buffer text tokens for this iteration — we only emit them to SSE if this turns
    // out to be the final turn (no tool calls). This keeps the UI and the persisted DB
    // history consistent: clients never see assistant text that won't be stored.
    const toolCallMap: Record<number, { id: string; name: string; arguments: string }> = {};
    const iterTokens: string[] = [];
    let contentBuffer = "";

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta.content) {
        iterTokens.push(delta.content);
        contentBuffer += delta.content;
      }

      // Tool call deltas — accumulate by index
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallMap[tc.index]) {
            toolCallMap[tc.index] = { id: "", name: "", arguments: "" };
          }
          if (tc.id) toolCallMap[tc.index].id = tc.id;
          if (tc.function?.name) toolCallMap[tc.index].name += tc.function.name;
          if (tc.function?.arguments) toolCallMap[tc.index].arguments += tc.function.arguments;
        }
      }
    }

    const pendingToolCalls = Object.values(toolCallMap).filter((tc) => tc.name);

    if (pendingToolCalls.length === 0) {
      // Final text turn — emit buffered tokens to the client and exit loop
      finalContent = contentBuffer;
      for (const tok of iterTokens) sendEvent({ type: "token", text: tok });
      break;
    }

    // Append assistant turn with tool calls to message history
    chatMessages.push({
      role: "assistant",
      content: contentBuffer || null,
      tool_calls: pendingToolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // Execute each tool call
    const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    for (const tc of pendingToolCalls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.arguments) as Record<string, unknown>; } catch { /* empty */ }

      const result = await handleToolCall(tc.name, args, sessionToken, sessionId);

      if (tc.name === "create_logistic_order") {
        try {
          const parsed = JSON.parse(result) as { success?: boolean; orderNumber?: string; orderId?: number };
          if (parsed.success && parsed.orderNumber && parsed.orderId) {
            sendEvent({ type: "order", orderNumber: parsed.orderNumber, orderId: parsed.orderId });
          }
        } catch { /* empty */ }
      }

      if (tc.name === "get_order_status") {
        try {
          const parsed = JSON.parse(result) as {
            found?: boolean;
            orders?: Array<{
              orderNumber: string;
              status: string;
              shipmentType: string;
              origin: string;
              destination: string;
              customerName: string;
              requiredDate: string | null;
              createdAt: string;
              latestAdminReply: string | null;
            }>;
          };
          if (parsed.found && parsed.orders && parsed.orders.length > 0) {
            sendEvent({ type: "status", orders: parsed.orders });
          } else if (!parsed.found) {
            // Clear any stale status cards in the frontend
            sendEvent({ type: "status", orders: [] });
          }
        } catch { /* empty */ }
      }

      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    chatMessages.push(...toolResults);
    // Loop continues: tool results are appended, next iteration will produce the final text
  }

  // Persist the final assistant reply
  if (finalContent) {
    await db.insert(aiChatMessagesTable).values({
      sessionId,
      role: "assistant",
      content: finalContent,
    });
  }

  sendEvent({ type: "done" });
}

// ── POST /api/ai-agent/chat  (SSE streaming) ──────────────────────────────────
aiAgentRouter.post("/chat", async (req: Request, res: Response) => {
  const { sessionToken: incomingToken, message } = req.body as {
    sessionToken?: string;
    message?: string;
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ message: "Pesan tidak boleh kosong" });
  }

  // Set SSE headers before any async work so the client can start reading
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function sendEvent(data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
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

    // Send session token early so the client can persist it
    sendEvent({ type: "session", sessionToken: session.sessionToken });

    await streamAiChat(session.id, session.sessionToken, message.trim(), res);

    res.end();
  } catch (err) {
    logger.error({ err }, "AI agent stream error");
    sendEvent({ type: "error", message: "Terjadi kesalahan pada AI. Silakan coba lagi." });
    res.end();
  }
});

// ── GET /api/ai-agent/session/:token ─────────────────────────────────────────
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
    .where(eq(aiChatMessagesTable.sessionId, session.id))
    .orderBy(asc(aiChatMessagesTable.createdAt));

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

// ── GET /api/ai-agent/session/by-order/:orderId ───────────────────────────────
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
    .where(eq(aiChatMessagesTable.sessionId, session.id))
    .orderBy(asc(aiChatMessagesTable.createdAt));

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

// ── POST /api/ai-agent/session/:token/admin-reply ────────────────────────────
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
