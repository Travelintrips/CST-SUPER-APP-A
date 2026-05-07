import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, User, Package } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [orderCreated, setOrderCreated] = useState<OrderCreated | null>(null);
  const [unread, setUnread] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    saveMessages(messages);
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, message: text }),
      });
      const data = (await res.json()) as {
        sessionToken?: string;
        message?: string;
        orderCreated?: OrderCreated | null;
      };

      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
        saveSession(data.sessionToken);
      }
      if (data.message) {
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message,
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (!open) setUnread((n) => n + 1);
      }
      if (data.orderCreated) {
        setOrderCreated(data.orderCreated);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 2).toString(), role: "assistant", content: "Maaf, terjadi kesalahan koneksi. Silakan coba lagi." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function resetChat() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(MESSAGES_KEY);
    } catch { /* empty */ }
    setSessionToken(null);
    setMessages([GREETING]);
    setOrderCreated(null);
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
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                Online
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
            {loading && (
              <div className="flex gap-2 flex-row">
                <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-sky-600" />
                </div>
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-sky-400 inline-block animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
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
                placeholder="Ketik pesan..."
                className="flex-1 text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 bg-gray-50"
                disabled={loading}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim()}
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
        className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg hover:shadow-xl text-white flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
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
