import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, User, Package, Truck, CheckCircle2, Clock, XCircle, ArrowRight, Mic, MicOff, ClipboardList } from "lucide-react";
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
  | { type: "form"; service: string }
  | { type: "done" }
  | { type: "error"; message: string };

const SESSION_KEY = "cst_ai_chat_session";
const MESSAGES_KEY = "cst_ai_chat_messages";
const LAST_SEEN_KEY = "cst_ai_chat_last_seen";

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
    "Halo! 👋 Selamat datang di CST Logistics.\n\n" +
    "Saya siap membantu Anda:\n" +
    "• Informasi layanan (Sea/Air/Trucking/Customs)\n" +
    "• **Buat order cepat** — ketik 'mau kirim' atau 'trucking', form langsung muncul!\n" +
    "• Cek status order Anda\n\n" +
    "Ada yang bisa saya bantu?",
};

interface OrderFormProps {
  service: string;
  sessionToken: string | null;
  onSuccess: (orderNumber: string, orderId: number, token: string) => void;
  onDismiss: () => void;
}

const SERVICE_OPTIONS = ["Trucking", "Sea Freight", "Air Freight", "Customs", "Packing & Crating"];

function OrderForm({ service, sessionToken, onSuccess, onDismiss }: OrderFormProps) {
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    companyName: "",
    shipmentType: service || "Trucking",
    origin: "",
    destination: "",
    commodity: "",
    grossWeight: "",
    volumeCbm: "",
    requiredDate: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName.trim() || !form.phone.trim() || !form.origin.trim() || !form.destination.trim()) {
      setError("Isi semua field bertanda *");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/ai-agent/quick-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sessionToken }),
      });
      const data = await res.json() as { success?: boolean; orderNumber?: string; orderId?: number; sessionToken?: string; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Gagal membuat order, coba lagi.");
        return;
      }
      onSuccess(data.orderNumber!, data.orderId!, data.sessionToken ?? sessionToken ?? "");
    } catch {
      setError("Gagal koneksi, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const inp = "w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-sky-400 bg-white";
  const lbl = "text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5 block";

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-sky-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border-b border-sky-100">
        <ClipboardList className="h-4 w-4 text-sky-600 shrink-0" />
        <p className="text-xs font-semibold text-sky-800 flex-1">Form Order Cepat</p>
        <button type="button" onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label className={lbl}>Nama Lengkap *</label>
          <input className={inp} placeholder="Budi Santoso" {...field("customerName")} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>No. WhatsApp *</label>
            <input className={inp} placeholder="081234..." type="tel" {...field("phone")} />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input className={inp} placeholder="email@..." type="email" {...field("email")} />
          </div>
        </div>

        <div>
          <label className={lbl}>Nama Perusahaan</label>
          <input className={inp} placeholder="PT Contoh / individu" {...field("companyName")} />
        </div>

        <div>
          <label className={lbl}>Jenis Pengiriman *</label>
          <select className={inp} {...field("shipmentType")}>
            {SERVICE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Kota Asal *</label>
            <input className={inp} placeholder="Surabaya" {...field("origin")} />
          </div>
          <div>
            <label className={lbl}>Kota Tujuan *</label>
            <input className={inp} placeholder="Jakarta" {...field("destination")} />
          </div>
        </div>

        <div>
          <label className={lbl}>Komoditi / Jenis Barang</label>
          <input className={inp} placeholder="Elektronik, Tekstil, dll" {...field("commodity")} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Berat (kg)</label>
            <input className={inp} placeholder="500" type="number" min="0" {...field("grossWeight")} />
          </div>
          <div>
            <label className={lbl}>Volume (CBM)</label>
            <input className={inp} placeholder="2.5" type="number" min="0" step="0.1" {...field("volumeCbm")} />
          </div>
        </div>

        <div>
          <label className={lbl}>Tanggal Pengiriman</label>
          <input className={inp} type="date" {...field("requiredDate")} />
        </div>

        <div>
          <label className={lbl}>Catatan</label>
          <textarea
            className={`${inp} resize-none`}
            rows={2}
            placeholder="Info tambahan..."
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>

        {error && <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 text-xs py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Tutup
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 text-xs py-2 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Mengirim…" : "Buat Order →"}
          </button>
        </div>
      </div>
    </form>
  );
}

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
  /** Inline quick-order form triggered by AI or user */
  const [showForm, setShowForm] = useState<{ service: string } | null>(null);
  /** Voice input state */
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Keep a mutable ref to accumulate text tokens without extra re-renders */
  const streamBufferRef = useRef<string>("");
  /** AbortController so we can cancel inflight stream on unmount */
  const abortRef = useRef<AbortController | null>(null);
  /** SpeechRecognition instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  /** ISO timestamp of when the user last viewed the widget — used for admin-reply polling */
  const lastSeenAtRef = useRef<string>(
    (() => { try { return localStorage.getItem(LAST_SEEN_KEY) ?? ""; } catch { return ""; } })()
  );
  /** Admin messages received while widget was closed — flushed to state on next open */
  const pendingAdminRef = useRef<ChatMessage[]>([]);

  const isStreaming = streamingContent !== null;

  // On open: flush pending admin messages into chat, clear unread, update lastSeenAt
  useEffect(() => {
    if (open) {
      setUnread(0);
      if (pendingAdminRef.current.length > 0) {
        const pending = pendingAdminRef.current;
        pendingAdminRef.current = [];
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = pending.filter((m) => !existingIds.has(m.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
      const now = new Date().toISOString();
      lastSeenAtRef.current = now;
      try { localStorage.setItem(LAST_SEEN_KEY, now); } catch { /* empty */ }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Poll for new admin replies every 30 s while widget is closed
  useEffect(() => {
    if (!sessionToken || open) return;

    async function pollAdminReplies() {
      if (!sessionToken) return;
      try {
        const since = lastSeenAtRef.current || new Date(0).toISOString();
        const res = await fetch(
          `/api/ai-agent/session/${sessionToken}?since=${encodeURIComponent(since)}`
        );
        if (!res.ok) return;
        const data = await res.json() as {
          messages: Array<{ id: number; role: string; content: string; createdAt: string }>;
        };
        const adminMsgs = data.messages.filter((m) => m.role === "admin");
        if (adminMsgs.length === 0) return;

        const existingIds = new Set(pendingAdminRef.current.map((m) => m.id));
        const toAdd = adminMsgs
          .map((m) => ({ id: String(m.id), role: "admin" as const, content: m.content }))
          .filter((m) => !existingIds.has(m.id));

        if (toAdd.length > 0) {
          pendingAdminRef.current = [...pendingAdminRef.current, ...toAdd];
          setUnread((n) => n + toAdd.length);
        }
      } catch { /* network errors are silently ignored */ }
    }

    // Run once immediately on start, then every 30 s
    void pollAdminReplies();
    const id = setInterval(() => void pollAdminReplies(), 30_000);
    return () => clearInterval(id);
  }, [sessionToken, open]);

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

    // Reset streaming state, stale status cards, and inline form
    streamBufferRef.current = "";
    setStreamingContent("");
    setOrderStatuses([]);
    setShowForm(null);

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

            case "form":
              setShowForm({ service: event.service });
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

  function toggleVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const SR: (new () => { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }) | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert("Browser Anda belum mendukung input suara. Coba Chrome atau Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SR();
    recognition.lang = "id-ID";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const transcript = String(e.results[0][0].transcript);
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function resetChat() {
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(MESSAGES_KEY);
    } catch { /* empty */ }
    setSessionToken(null);
    setMessages([GREETING]);
    setOrderCreated(null);
    setOrderStatuses([]);
    setShowForm(null);
    setIsListening(false);
    streamBufferRef.current = "";
    setStreamingContent(null);
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-2">
      {open && (
        <div
          className="flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ width: 368, maxHeight: "80vh", height: 560 }}
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

            {showForm && (
              <OrderForm
                service={showForm.service}
                sessionToken={sessionToken}
                onSuccess={(orderNumber, orderId, token) => {
                  setShowForm(null);
                  setOrderCreated({ orderNumber, orderId });
                  if (token && token !== sessionToken) {
                    setSessionToken(token);
                    saveSession(token);
                  }
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: (Date.now() + 10).toString(),
                      role: "assistant",
                      content: `✅ Order berhasil dibuat! No. Order: **${orderNumber}**\nTim kami akan segera menghubungi Anda untuk konfirmasi harga.`,
                    },
                  ]);
                }}
                onDismiss={() => setShowForm(null)}
              />
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
          <div className="px-3 py-2.5 bg-white border-t border-gray-100">
            {isListening && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-medium mb-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                Mendengarkan… (bicara sekarang)
              </div>
            )}
            <div className="flex gap-1.5 items-center">
              <button
                type="button"
                onClick={toggleVoice}
                disabled={isStreaming}
                title={isListening ? "Berhenti merekam" : "Input suara (Bahasa Indonesia)"}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 ${
                  isListening
                    ? "bg-red-500 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={isStreaming ? "Menunggu balasan…" : isListening ? "Bicara sekarang…" : "Ketik atau bicara…"}
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
            <button
              type="button"
              onClick={() => setShowForm({ service: "" })}
              className="w-full mt-1.5 text-[11px] text-sky-600 hover:text-sky-700 flex items-center justify-center gap-1 py-1 rounded-lg hover:bg-sky-50 transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Buka form order langsung
            </button>
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
