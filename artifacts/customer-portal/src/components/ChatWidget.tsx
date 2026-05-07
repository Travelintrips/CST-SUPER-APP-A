import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, User, Package, Truck, CheckCircle2, Clock, XCircle, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "admin";
  content: string;
}

interface OrderCreated {
  orderNumber: string;
  orderId: number;
}

interface OrderStatusEntry {
  orderNumber: string;
  status: string;
  shipmentType: string;
  origin: string;
  destination: string;
  customerName: string;
  requiredDate: string | null;
  createdAt: string;
  latestAdminReply: string | null;
}

/** SSE events sent by /api/ai-agent/chat */
type SseEvent =
  | { type: "session"; sessionToken: string }
  | { type: "token"; text: string }
  | { type: "order"; orderNumber: string; orderId: number }
  | { type: "status"; orders: OrderStatusEntry[] }
  | { type: "done" }
  | { type: "error"; message: string };

const SESSION_KEY = "cst_ai_chat_session";
const MESSAGES_KEY = "cst_ai_chat_messages";

function loadSession(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}
function saveSession(token: string) {
  try { localStorage.setItem(SESSION_KEY, token); } catch { /* empty */ }
}
function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch { return []; }
}
function saveMessages(msgs: ChatMessage[]) {
  try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs.slice(-80))); } catch { /* empty */ }
}

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  content:
    "Halo! 👋 Selamat datang di CST Logistics. Saya asisten virtual Anda.\n\n" +
    "Saya bisa membantu Anda:\n" +
    "• Informasi layanan pengiriman (Sea/Air/Trucking)\n" +
    "• Estimasi biaya dan waktu pengiriman\n" +
    "• **Membuat order logistik** secara langsung\n\n" +
    "Ada yang bisa saya bantu?",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadMessages();
    return saved.length > 0 ? saved : [GREETING];
  });
  const [sessionToken, setSessionToken] = useState<string | null>(loadSession);
  /** Content being streamed right now (null = not streaming) */
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [orderCreated, setOrderCreated] = useState<OrderCreated | null>(null);
  /** Latest order status results shown as a compact card */
  const [orderStatuses, setOrderStatuses] = useState<OrderStatusEntry[]>([]);
  const [unread, setUnread] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Keep a mutable ref to accumulate text tokens without extra re-renders */
  const streamBufferRef = useRef<string>("");
  /** AbortController so we can cancel inflight stream on unmount */
  const abortRef = useRef<AbortController | null>(null);

  const isStreaming = streamingContent !== null;

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!isStreaming) saveMessages(messages);
  }, [messages, isStreaming]);

  // Cancel any inflight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Reset streaming state
    streamBufferRef.current = "";
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, message: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      let pendingOrder: OrderCreated | null = null;
      /** Guard: was the stream cleanly terminated by the server? */
      let doneReceived = false;

      // Update streaming bubble every N ms to batch React re-renders
      let rafId: ReturnType<typeof setTimeout> | null = null;

      function flushStreamToState() {
        rafId = null;
        setStreamingContent(streamBufferRef.current);
      }

      function scheduleFlush() {
        if (rafId === null) {
          rafId = setTimeout(flushStreamToState, 30);
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });

        // Split on newlines; keep incomplete last segment in buffer
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: SseEvent;
          try { event = JSON.parse(line.slice(6)) as SseEvent; } catch { continue; }

          switch (event.type) {
            case "session":
              setSessionToken(event.sessionToken);
              saveSession(event.sessionToken);
              break;

            case "token":
              streamBufferRef.current += event.text;
              scheduleFlush();
              break;

            case "order":
              pendingOrder = { orderNumber: event.orderNumber, orderId: event.orderId };
              break;

            case "status":
              setOrderStatuses(event.orders);
              break;

            case "done": {
              doneReceived = true;
              // Finalize: move streamed content into completed messages
              if (rafId !== null) { clearTimeout(rafId); rafId = null; }
              const finalText = streamBufferRef.current;
              streamBufferRef.current = "";
              setStreamingContent(null);
              if (finalText) {
                const aiMsg: ChatMessage = {
                  id: (Date.now() + 1).toString(),
                  role: "assistant",
                  content: finalText,
                };
                setMessages((prev) => [...prev, aiMsg]);
                if (!open) setUnread((n) => n + 1);
              }
              if (pendingOrder) setOrderCreated(pendingOrder);
              break;
            }

            case "error":
              doneReceived = true;
              if (rafId !== null) { clearTimeout(rafId); rafId = null; }
              streamBufferRef.current = "";
              setStreamingContent(null);
              setMessages((prev) => [
                ...prev,
                { id: (Date.now() + 2).toString(), role: "assistant", content: event.message },
              ]);
              break;
          }
        }
      }

      // Defensive finalization: if the TCP connection closed without a done/error event
      // (e.g. proxy timeout, server crash mid-stream), flush whatever was buffered and
      // restore the input so the user is never left with a permanently disabled widget.
      if (!doneReceived) {
        if (rafId !== null) { clearTimeout(rafId); rafId = null; }
        const leftover = streamBufferRef.current;
        streamBufferRef.current = "";
        setStreamingContent(null);
        if (leftover) {
          setMessages((prev) => [
            ...prev,
            { id: (Date.now() + 4).toString(), role: "assistant", content: leftover },
          ]);
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      streamBufferRef.current = "";
      setStreamingContent(null);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 3).toString(), role: "assistant", content: "Maaf, terjadi kesalahan koneksi. Silakan coba lagi." },
      ]);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function statusStyle(status: string) {
    switch (status) {
      case "New Order":
        return { icon: Clock, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-500", badge: "bg-blue-100 text-blue-700" };
      case "In Progress":
        return { icon: Truck, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-500", badge: "bg-amber-100 text-amber-700" };
      case "Completed":
        return { icon: CheckCircle2, bg: "bg-green-50", border: "border-green-200", text: "text-green-500", badge: "bg-green-100 text-green-700" };
      case "Cancelled":
        return { icon: XCircle, bg: "bg-red-50", border: "border-red-200", text: "text-red-500", badge: "bg-red-100 text-red-700" };
      default:
        return { icon: Package, bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", badge: "bg-gray-100 text-gray-700" };
    }
  }

  function resetChat() {
    abortRef.current?.abort();
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(MESSAGES_KEY);
    } catch { /* empty */ }
    setSessionToken(null);
    setMessages([GREETING]);
    setOrderCreated(null);
    setOrderStatuses([]);
    streamBufferRef.current = "";
    setStreamingContent(null);
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2">
      {open && (
        <div
          className="flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ width: 360, height: 520 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-sky-600 to-blue-700 text-white">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">CST Logistics Assistant</p>
              <p className="text-xs text-sky-200 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${isStreaming ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
                {isStreaming ? "Mengetik…" : "Online"}
              </p>
            </div>
            <button
              onClick={resetChat}
              className="text-white/60 hover:text-white text-xs mr-1 transition-colors"
              title="Reset percakapan"
            >
              Reset
            </button>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {msg.role !== "user" && (
                  <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                    {msg.role === "admin" ? (
                      <User className="h-3.5 w-3.5 text-sky-700" />
                    ) : (
                      <Bot className="h-3.5 w-3.5 text-sky-600" />
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-sky-600 text-white rounded-tr-sm"
                      : msg.role === "admin"
                      ? "bg-amber-50 border border-amber-200 text-gray-800 rounded-tl-sm"
                      : "bg-white border border-gray-100 text-gray-800 shadow-sm rounded-tl-sm"
                  }`}
                >
                  {msg.role === "admin" && (
                    <p className="text-[10px] font-semibold text-amber-600 mb-1">Admin CST</p>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Live streaming bubble — replaces the old bouncing dots */}
            {isStreaming && (
              <div className="flex gap-2 flex-row">
                <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-sky-600" />
                </div>
                <div className="max-w-[78%] bg-white border border-gray-100 text-gray-800 shadow-sm rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {streamingContent || (
                    /* Bouncing dots only while waiting for the first token */
                    <span className="flex gap-1 items-center h-5">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-2 h-2 rounded-full bg-sky-400 inline-block animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </span>
                  )}
                  {/* Blinking cursor at end of streaming text */}
                  {streamingContent && (
                    <span className="inline-block w-0.5 h-4 bg-sky-500 align-middle ml-0.5 animate-pulse" />
                  )}
                </div>
              </div>
            )}

            {orderCreated && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-3">
                <Package className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Order Berhasil Dibuat!</p>
                  <p className="text-xs text-green-700 mt-0.5">No. Order: {orderCreated.orderNumber}</p>
                  <Link
                    href="/track"
                    className="text-xs text-green-700 underline font-medium mt-1 inline-block"
                    onClick={() => setOpen(false)}
                  >
                    Lacak status order →
                  </Link>
                </div>
              </div>
            )}

            {orderStatuses.length > 0 && (
              <div className="space-y-2">
                {orderStatuses.map((ord) => {
                  const { icon: StatusIcon, bg, border, text, badge } = statusStyle(ord.status);
                  return (
                    <div key={ord.orderNumber} className={`rounded-xl border ${border} ${bg} p-3`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusIcon className={`h-4 w-4 ${text} shrink-0`} />
                        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">
                          {ord.orderNumber}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>
                          {ord.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                        <Truck className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate">{ord.shipmentType}</span>
                        <span className="mx-0.5 text-gray-300">·</span>
                        <span className="truncate">{ord.origin}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate">{ord.destination}</span>
                      </div>
                      {ord.latestAdminReply && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-1 leading-snug line-clamp-2">
                          💬 {ord.latestAdminReply}
                        </p>
                      )}
                      <Link
                        href="/track"
                        className="text-[11px] text-sky-600 underline font-medium mt-1.5 inline-block"
                        onClick={() => setOpen(false)}
                      >
                        Lihat detail →
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 bg-white border-t border-gray-100">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={isStreaming ? "Menunggu balasan…" : "Ketik pesan..."}
                className="flex-1 text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 bg-gray-50"
                disabled={isStreaming}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={isStreaming || !input.trim()}
                className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg hover:shadow-xl text-white flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
        style={{ boxShadow: "0 4px 24px rgba(14,165,233,0.45)" }}
        aria-label="Chat dengan AI assistant"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
