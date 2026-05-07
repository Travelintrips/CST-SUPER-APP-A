import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  Mic,
  MicOff,
  ClipboardList,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
} from "lucide-react";
import { Link } from "wouter";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "admin";
  content: string;
  createdAt?: string;
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
  | {
      type: "product_form";
      productId: number;
      productName: string;
      unitPrice: number;
      unit: string;
    }
  | { type: "done" }
  | { type: "error"; message: string };

function formatMsgTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const hhmm = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Kemarin ${hhmm}`;
  return (
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) +
    " " +
    hhmm
  );
}

const SESSION_KEY = "cst_ai_chat_session";
const MESSAGES_KEY = "cst_ai_chat_messages";
const LAST_SEEN_KEY = "cst_ai_chat_last_seen";

function loadSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function saveSession(token: string) {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    /* empty */
  }
}
function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}
function saveMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs.slice(-80)));
  } catch {
    /* empty */
  }
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

const SERVICE_OPTIONS = [
  "Trucking",
  "Sea Freight",
  "Air Freight",
  "Customs",
  "Packing & Crating",
];

function OrderForm({
  service,
  sessionToken,
  onSuccess,
  onDismiss,
}: OrderFormProps) {
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
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >,
      ) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.customerName.trim() ||
      !form.phone.trim() ||
      !form.origin.trim() ||
      !form.destination.trim()
    ) {
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
      const data = (await res.json()) as {
        success?: boolean;
        orderNumber?: string;
        orderId?: number;
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Gagal membuat order, coba lagi.");
        return;
      }
      onSuccess(
        data.orderNumber!,
        data.orderId!,
        data.sessionToken ?? sessionToken ?? "",
      );
    } catch {
      setError("Gagal koneksi, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const inp =
    "w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 bg-white transition-all duration-200";
  const lbl =
    "text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-sky-200 rounded-2xl shadow-sm overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border-b border-sky-100">
        <ClipboardList className="h-4 w-4 text-sky-600 shrink-0" />
        <p className="text-xs font-semibold text-sky-800 flex-1">
          Form Order Cepat
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label className={lbl}>Nama Lengkap *</label>
          <input
            className={inp}
            placeholder="Budi Santoso"
            {...field("customerName")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>No. WhatsApp *</label>
            <input
              className={inp}
              placeholder="081234..."
              type="tel"
              {...field("phone")}
            />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input
              className={inp}
              placeholder="email@..."
              type="email"
              {...field("email")}
            />
          </div>
        </div>

        <div>
          <label className={lbl}>Nama Perusahaan</label>
          <input
            className={inp}
            placeholder="PT Contoh / individu"
            {...field("companyName")}
          />
        </div>

        <div>
          <label className={lbl}>Jenis Pengiriman *</label>
          <select className={inp} {...field("shipmentType")}>
            {SERVICE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Kota Asal *</label>
            <input
              className={inp}
              placeholder="Surabaya"
              {...field("origin")}
            />
          </div>
          <div>
            <label className={lbl}>Kota Tujuan *</label>
            <input
              className={inp}
              placeholder="Jakarta"
              {...field("destination")}
            />
          </div>
        </div>

        <div>
          <label className={lbl}>Komoditi / Jenis Barang</label>
          <input
            className={inp}
            placeholder="Elektronik, Tekstil, dll"
            {...field("commodity")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Berat (kg)</label>
            <input
              className={inp}
              placeholder="500"
              type="number"
              min="0"
              {...field("grossWeight")}
            />
          </div>
          <div>
            <label className={lbl}>Volume (CBM)</label>
            <input
              className={inp}
              placeholder="2.5"
              type="number"
              min="0"
              step="0.1"
              {...field("volumeCbm")}
            />
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

        {error && (
          <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1">
            {error}
          </p>
        )}

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

interface ProductOrderFormProps {
  productId: number;
  productName: string;
  unitPrice: number;
  unit: string;
  sessionToken: string | null;
  onSuccess: (orderNumber: string, orderId: number, token: string) => void;
  onDismiss: () => void;
}

function ProductOrderForm({
  productId,
  productName,
  unitPrice,
  unit,
  sessionToken,
  onSuccess,
  onDismiss,
}: ProductOrderFormProps) {
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    qty: "1",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  const totalPrice = unitPrice * (parseInt(form.qty) || 0);
  const fmtPrice = (n: number) =>
    n.toLocaleString("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qtyNum = parseInt(form.qty);
    if (
      !form.customerName.trim() ||
      !form.phone.trim() ||
      !qtyNum ||
      qtyNum <= 0
    ) {
      setError("Isi semua field bertanda *");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/ai-agent/quick-product-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          customerName: form.customerName,
          phone: form.phone,
          email: form.email,
          productId,
          productName,
          qty: qtyNum,
          unitPrice,
          notes: form.notes,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        orderNumber?: string;
        orderId?: number;
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Gagal membuat order, coba lagi.");
        return;
      }
      onSuccess(
        data.orderNumber!,
        data.orderId!,
        data.sessionToken ?? sessionToken ?? "",
      );
    } catch {
      setError("Gagal koneksi, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const inp =
    "w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 bg-white transition-all duration-200";
  const lbl =
    "text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-emerald-200 rounded-2xl shadow-sm overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-100">
        <Package className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-xs font-semibold text-emerald-800 flex-1">
          Pesan Produk
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2 bg-emerald-50/50 border-b border-emerald-100">
        <p className="text-xs font-semibold text-gray-800 truncate">
          {productName}
        </p>
        <p className="text-[11px] text-gray-500">
          {fmtPrice(unitPrice)} / {unit}
        </p>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div>
          <label className={lbl}>Nama Lengkap *</label>
          <input
            className={inp}
            placeholder="Budi Santoso"
            {...field("customerName")}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>No. WhatsApp *</label>
            <input
              className={inp}
              placeholder="081234..."
              type="tel"
              {...field("phone")}
            />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input
              className={inp}
              placeholder="email@..."
              type="email"
              {...field("email")}
            />
          </div>
        </div>

        <div>
          <label className={lbl}>Jumlah ({unit}) *</label>
          <input
            className={inp}
            type="number"
            min="1"
            placeholder="1"
            {...field("qty")}
          />
        </div>

        {totalPrice > 0 && (
          <div className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
            Total: {fmtPrice(totalPrice)}
          </div>
        )}

        <div>
          <label className={lbl}>Catatan</label>
          <textarea
            className={`${inp} resize-none`}
            rows={2}
            placeholder="Alamat pengiriman, catatan khusus..."
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>

        {error && (
          <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1">
            {error}
          </p>
        )}

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
            className="flex-1 text-xs py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Mengirim…" : "Pesan Sekarang →"}
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
  /** Inline product order form triggered by AI */
  const [showProductForm, setShowProductForm] = useState<{
    productId: number;
    productName: string;
    unitPrice: number;
    unit: string;
  } | null>(null);
  /** Voice input state */
  const [isListening, setIsListening] = useState(false);
  /** TTS output: auto-speak AI responses when enabled */
  const [voiceOutput, setVoiceOutput] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cst_ai_voice_output") === "1";
    } catch {
      return false;
    }
  });
  /** True while speechSynthesis is reading aloud */
  const [isSpeaking, setIsSpeaking] = useState(false);
  /** Sound effects toggle — persisted across sessions */
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cst_chat_sfx") !== "off";
    } catch {
      return true;
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Keep a mutable ref to accumulate text tokens without extra re-renders */
  const streamBufferRef = useRef<string>("");
  /** AbortController so we can cancel inflight stream on unmount */
  const abortRef = useRef<AbortController | null>(null);
  /** SpeechRecognition instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  /** Stores the transcript captured during a push-to-talk session */
  const pendingTranscriptRef = useRef<string>("");
  /** ISO timestamp of when the user last viewed the widget — used for admin-reply polling */
  const lastSeenAtRef = useRef<string>(
    (() => {
      try {
        return localStorage.getItem(LAST_SEEN_KEY) ?? "";
      } catch {
        return "";
      }
    })(),
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
      try {
        localStorage.setItem(LAST_SEEN_KEY, now);
      } catch {
        /* empty */
      }
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
          `/api/ai-agent/session/${sessionToken}?since=${encodeURIComponent(since)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: Array<{
            id: number;
            role: string;
            content: string;
            createdAt: string;
          }>;
        };
        const adminMsgs = data.messages.filter((m) => m.role === "admin");
        if (adminMsgs.length === 0) return;

        const existingIds = new Set(pendingAdminRef.current.map((m) => m.id));
        const toAdd = adminMsgs
          .map((m) => ({
            id: String(m.id),
            role: "admin" as const,
            content: m.content,
            createdAt: m.createdAt,
          }))
          .filter((m) => !existingIds.has(m.id));

        if (toAdd.length > 0) {
          pendingAdminRef.current = [...pendingAdminRef.current, ...toAdd];
          setUnread((n) => n + toAdd.length);
          playSound("notification");
        }
      } catch {
        /* network errors are silently ignored */
      }
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

  // Cancel any inflight stream on unmount; also stop any TTS
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  /** Strip markdown symbols so TTS sounds natural */
  function stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s*/g, "")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-•]\s*/gm, "")
      .trim();
  }

  /** Speak text aloud using Web Speech API */
  function speak(text: string) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = stripMarkdown(text);
    if (!clean) return;
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = "id-ID";
    utt.rate = 1.05;
    utt.pitch = 1;
    // Prefer Indonesian voice, fall back to any available
    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find((v) => v.lang.startsWith("id")) ?? voices[0];
    if (idVoice) utt.voice = idVoice;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }

  function stopSpeaking() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  function toggleVoiceOutput() {
    setVoiceOutput((v) => {
      const next = !v;
      try {
        localStorage.setItem("cst_ai_voice_output", next ? "1" : "0");
      } catch {
        /* empty */
      }
      if (!next) stopSpeaking();
      return next;
    });
  }

  /** Synthesize a short UI sound via Web Audio API — no external files, iOS/Android safe */
  function playSound(type: "sent" | "received" | "notification" | "error") {
    if (!sfxEnabled) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: (new () => AudioContext) | undefined =
        (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const g = ctx.createGain();
      g.connect(ctx.destination);

      const configs: Record<
        typeof type,
        {
          wave: OscillatorType;
          freqStart: number;
          freqEnd: number;
          duration: number;
          gain: number;
        }
      > = {
        sent: {
          wave: "sine",
          freqStart: 880,
          freqEnd: 1100,
          duration: 0.12,
          gain: 0.28,
        },
        received: {
          wave: "sine",
          freqStart: 660,
          freqEnd: 880,
          duration: 0.18,
          gain: 0.32,
        },
        notification: {
          wave: "triangle",
          freqStart: 1200,
          freqEnd: 900,
          duration: 0.25,
          gain: 0.28,
        },
        error: {
          wave: "sawtooth",
          freqStart: 280,
          freqEnd: 140,
          duration: 0.2,
          gain: 0.18,
        },
      };
      const c = configs[type];
      const osc = ctx.createOscillator();
      osc.type = c.wave;
      osc.frequency.setValueAtTime(c.freqStart, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(
        c.freqEnd,
        ctx.currentTime + c.duration,
      );
      g.gain.setValueAtTime(c.gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + c.duration);
      osc.connect(g);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + c.duration);
      osc.onended = () => {
        void ctx.close();
      };
    } catch {
      /* audio blocked or unsupported — silently ignore */
    }
  }

  function toggleSfx() {
    setSfxEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem("cst_chat_sfx", next ? "on" : "off");
      } catch {
        /* empty */
      }
      return next;
    });
  }

  /** Core send logic — accepts text directly so push-to-talk and keyboard can share it */
  async function doSend(text: string) {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    playSound("sent");

    // Reset streaming state, stale status cards, inline forms, and stop any TTS
    streamBufferRef.current = "";
    setStreamingContent("");
    setOrderStatuses([]);
    setShowForm(null);
    setShowProductForm(null);
    stopSpeaking();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, message: text.trim() }),
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
          try {
            event = JSON.parse(line.slice(6)) as SseEvent;
          } catch {
            continue;
          }

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
              pendingOrder = {
                orderNumber: event.orderNumber,
                orderId: event.orderId,
              };
              break;

            case "status":
              setOrderStatuses(event.orders);
              break;

            case "form":
              setShowForm({ service: event.service });
              break;

            case "product_form":
              setShowProductForm({
                productId: event.productId,
                productName: event.productName,
                unitPrice: event.unitPrice,
                unit: event.unit,
              });
              break;

            case "done": {
              doneReceived = true;
              // Finalize: move streamed content into completed messages
              if (rafId !== null) {
                clearTimeout(rafId);
                rafId = null;
              }
              const finalText = streamBufferRef.current;
              streamBufferRef.current = "";
              setStreamingContent(null);
              if (finalText) {
                const aiMsg: ChatMessage = {
                  id: (Date.now() + 1).toString(),
                  role: "assistant",
                  content: finalText,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, aiMsg]);
                if (!open) {
                  setUnread((n) => n + 1);
                  playSound("notification");
                } else {
                  playSound("received");
                }
                // Auto-speak if voice output mode is on
                if (voiceOutput) speak(finalText);
              }
              if (pendingOrder) setOrderCreated(pendingOrder);
              break;
            }

            case "error":
              doneReceived = true;
              if (rafId !== null) {
                clearTimeout(rafId);
                rafId = null;
              }
              streamBufferRef.current = "";
              setStreamingContent(null);
              playSound("error");
              setMessages((prev) => [
                ...prev,
                {
                  id: (Date.now() + 2).toString(),
                  role: "assistant",
                  content: event.message,
                  createdAt: new Date().toISOString(),
                },
              ]);
              break;
          }
        }
      }

      // Defensive finalization: if the TCP connection closed without a done/error event
      // (e.g. proxy timeout, server crash mid-stream), flush whatever was buffered and
      // restore the input so the user is never left with a permanently disabled widget.
      if (!doneReceived) {
        if (rafId !== null) {
          clearTimeout(rafId);
          rafId = null;
        }
        const leftover = streamBufferRef.current;
        streamBufferRef.current = "";
        setStreamingContent(null);
        if (leftover) {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 4).toString(),
              role: "assistant",
              content: leftover,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      streamBufferRef.current = "";
      setStreamingContent(null);
      playSound("error");
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 3).toString(),
          role: "assistant",
          content: "Maaf, terjadi kesalahan koneksi. Silakan coba lagi.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }

  /** Thin wrapper so the text input and Enter key still work */
  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await doSend(text);
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
        return {
          icon: Clock,
          bg: "bg-blue-50",
          border: "border-blue-200",
          text: "text-blue-500",
          badge: "bg-blue-100 text-blue-700",
        };
      case "In Progress":
        return {
          icon: Truck,
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-500",
          badge: "bg-amber-100 text-amber-700",
        };
      case "Completed":
        return {
          icon: CheckCircle2,
          bg: "bg-green-50",
          border: "border-green-200",
          text: "text-green-500",
          badge: "bg-green-100 text-green-700",
        };
      case "Cancelled":
        return {
          icon: XCircle,
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-500",
          badge: "bg-red-100 text-red-700",
        };
      default:
        return {
          icon: Package,
          bg: "bg-gray-50",
          border: "border-gray-200",
          text: "text-gray-500",
          badge: "bg-gray-100 text-gray-700",
        };
    }
  }

  /** Push-to-talk: call on mousedown/touchstart */
  function startListening() {
    if (isStreaming || isListening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const SR:
      | (new () => {
          lang: string;
          continuous: boolean;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((e: any) => void) | null;
          onend: (() => void) | null;
          onerror: ((e: any) => void) | null;
          start(): void;
          stop(): void;
        })
      | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert("Browser Anda belum mendukung input suara. Coba Chrome atau Edge.");
      return;
    }
    pendingTranscriptRef.current = "";
    const recognition = new SR();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      pendingTranscriptRef.current = String(e.results[0][0].transcript);
    };
    recognition.onend = () => {
      setIsListening(false);
      const transcript = pendingTranscriptRef.current.trim();
      pendingTranscriptRef.current = "";
      if (transcript) void doSend(transcript);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ((e as { error?: string }).error !== "no-speech") {
        setIsListening(false);
        pendingTranscriptRef.current = "";
      }
      // "no-speech" is handled by onend naturally
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);

    // Use document-level release listeners so recording doesn't stop if the
    // pointer drifts off the button while the user is still holding it.
    const release = () => {
      recognitionRef.current?.stop();
      document.removeEventListener("mouseup", release);
      document.removeEventListener("touchend", release);
    };
    document.addEventListener("mouseup", release, { once: true });
    document.addEventListener("touchend", release, { once: true });
  }

  function resetChat() {
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    stopSpeaking();
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(MESSAGES_KEY);
    } catch {
      /* empty */
    }
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
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[9998] transition-opacity duration-300"
          style={{
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            animation: "backdropIn 0.25s ease-out",
          }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat panel — centered modal */}
      {open && (
        <div
          className="fixed z-[9999] flex flex-col bg-white overflow-hidden"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(92vw, 450px)",
            maxWidth: 450,
            height: "min(70vh, 600px)",
            borderRadius: 20,
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow:
              "0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            WebkitTapHighlightColor: "transparent",
            animation: "chatModalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3.5 sm:px-5 sm:py-4 shrink-0"
            style={{
              background: "linear-gradient(135deg, #0052D4 0%, #4364F7 100%)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <p
                className="font-semibold text-white leading-snug text-center sm:text-right text-[11px] sm:text-sm whitespace-nowrap"
                style={{
                  letterSpacing: "0.3px",
                  textShadow: "0 1px 3px rgba(0,0,0,0.18)",
                  lineHeight: 1.2,
                }}
              >
                <span className="sm:hidden">CST Logistics Assistant</span>
                <span className="hidden sm:inline">
                  CST Logistics Assistant
                </span>
              </p>
              <p className="text-xs text-sky-200 flex items-center justify-end gap-1 mt-0.5">
                {isSpeaking ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-purple-300 animate-pulse" />
                    <span className="animate-pulse">Berbicara…</span>
                  </>
                ) : (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full inline-block ${isStreaming ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`}
                    />
                    {isStreaming ? "Mengetik…" : "Online"}
                  </>
                )}
              </p>
            </div>
            {/* Icon button group — right-aligned */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
              {/* Sound effects toggle */}
              <button
                onClick={toggleSfx}
                title={
                  sfxEnabled ? "Matikan suara efek" : "Aktifkan suara efek"
                }
                className={`w-7 h-7 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center transition-all duration-300 ${
                  sfxEnabled
                    ? "bg-white/25 text-white"
                    : "bg-white/10 text-white/55 hover:text-white hover:bg-white/20"
                }`}
                style={{ transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)" }}
              >
                {sfxEnabled ? (
                  <Bell className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" />
                )}
              </button>
              {/* Voice output toggle */}
              <button
                onClick={isSpeaking ? stopSpeaking : toggleVoiceOutput}
                title={
                  isSpeaking
                    ? "Berhenti bicara"
                    : voiceOutput
                      ? "Matikan suara AI"
                      : "Aktifkan suara AI"
                }
                className={`w-7 h-7 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center transition-all duration-300 ${
                  voiceOutput || isSpeaking
                    ? "bg-white/25 text-white"
                    : "bg-white/10 text-white/55 hover:text-white hover:bg-white/20"
                }`}
                style={{ transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)" }}
              >
                {voiceOutput || isSpeaking ? (
                  <Volume2 className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" />
                )}
              </button>
              <button
                onClick={resetChat}
                className="h-11 sm:h-9 px-2.5 text-white/65 hover:text-white text-[11px] font-semibold tracking-wide transition-all duration-300 rounded-xl hover:bg-white/15"
                title="Reset percakapan"
                style={{ transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)" }}
              >
                Reset
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 rounded-xl transition-all duration-300"
                style={{ transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)" }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 sm:px-3 py-4 sm:py-3 space-y-3 bg-gray-50"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollBehavior: "smooth",
            }}
          >
            {messages.map((msg) => {
              const msgTime = formatMsgTime(msg.createdAt);
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role !== "user" && (
                    <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                      {msg.role === "admin" ? (
                        <User className="h-4 w-4 text-sky-700" />
                      ) : (
                        <Bot className="h-4 w-4 text-sky-600" />
                      )}
                    </div>
                  )}
                  <div
                    className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl rounded-tr-sm"
                          : msg.role === "admin"
                            ? "bg-amber-50 border border-amber-200 text-gray-800 rounded-2xl rounded-tl-sm"
                            : "bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm"
                      }`}
                      style={{
                        boxShadow:
                          msg.role === "user"
                            ? "0 2px 8px rgba(14,165,233,0.22)"
                            : "0 2px 8px rgba(0,0,0,0.06)",
                        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                      }}
                    >
                      {msg.role === "admin" && (
                        <p className="text-[10px] font-semibold text-amber-600 mb-1">
                          Admin CST
                        </p>
                      )}
                      {msg.content}
                    </div>
                    {msgTime && (
                      <p className="text-[10px] text-gray-400 mt-1 px-1">
                        {msgTime}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Live streaming bubble — replaces the old bouncing dots */}
            {isStreaming && (
              <div className="flex gap-2 flex-row">
                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-sky-600" />
                </div>
                <div
                  className="max-w-[85%] bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                >
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
                  <p className="text-sm font-semibold text-green-800">
                    Order Berhasil Dibuat!
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    No. Order: {orderCreated.orderNumber}
                  </p>
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
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                }}
                onDismiss={() => setShowForm(null)}
              />
            )}

            {showProductForm && (
              <ProductOrderForm
                productId={showProductForm.productId}
                productName={showProductForm.productName}
                unitPrice={showProductForm.unitPrice}
                unit={showProductForm.unit}
                sessionToken={sessionToken}
                onSuccess={(orderNumber, orderId, token) => {
                  setShowProductForm(null);
                  setOrderCreated({ orderNumber, orderId });
                  if (token && token !== sessionToken) {
                    setSessionToken(token);
                    saveSession(token);
                  }
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: (Date.now() + 11).toString(),
                      role: "assistant",
                      content: `✅ Pesanan **${showProductForm.productName}** berhasil dibuat! No. Order: **${orderNumber}**\nTim kami akan segera menghubungi Anda untuk konfirmasi dan pengiriman.`,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                }}
                onDismiss={() => setShowProductForm(null)}
              />
            )}

            {orderStatuses.length > 0 && (
              <div className="space-y-2">
                {orderStatuses.map((ord) => {
                  const {
                    icon: StatusIcon,
                    bg,
                    border,
                    text,
                    badge,
                  } = statusStyle(ord.status);
                  return (
                    <div
                      key={ord.orderNumber}
                      className={`rounded-xl border ${border} ${bg} p-3`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusIcon className={`h-4 w-4 ${text} shrink-0`} />
                        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">
                          {ord.orderNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}
                        >
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
          <div className="px-3 py-3 sm:py-2.5 bg-white border-t border-gray-100 shrink-0">
            {isListening && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-medium mb-2">
                <span className="flex gap-0.5 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-red-500 inline-block animate-bounce"
                      style={{
                        height: `${6 + i * 3}px`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </span>
                Merekam… lepas tombol untuk kirim
              </div>
            )}
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  startListening();
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startListening();
                }}
                disabled={isStreaming}
                title="Tahan untuk merekam suara, lepas untuk kirim"
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 shrink-0 disabled:opacity-40 select-none ${
                  isListening
                    ? "bg-red-500 text-white scale-110 shadow-lg"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-red-100 active:text-red-500"
                }`}
              >
                {isListening ? (
                  <MicOff className="h-4.5 w-4.5" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  isStreaming
                    ? "Menunggu balasan…"
                    : isListening
                      ? "Bicara sekarang…"
                      : "Ketik atau bicara…"
                }
                className="flex-1 rounded-full border outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                style={{
                  fontSize: 16,
                  lineHeight: "1.4",
                  background: "#f8f9fa",
                  borderColor: "#e9ecef",
                  padding: "10px 16px",
                  transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                }}
                disabled={isStreaming}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={isStreaming || !input.trim()}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #0284c7, #1d4ed8)",
                  boxShadow: "0 2px 8px rgba(14,165,233,0.35)",
                }}
              >
                <Send className="h-4 w-4 text-white" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowForm({ service: "" })}
              className="w-full mt-2 text-[11px] text-sky-600 hover:text-sky-700 flex items-center justify-center gap-1 py-1.5 rounded-xl hover:bg-sky-50 transition-all duration-200 min-h-[36px]"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Buka form order langsung
            </button>
          </div>
        </div>
      )}

      {/* Bubble button — fixed at bottom-right */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed z-[9999] rounded-full text-white flex items-center justify-center transition-all duration-300 hover:-translate-y-1 active:scale-95"
        style={{
          bottom: 24,
          right: 20,
          width: 52,
          height: 52,
          background: "linear-gradient(135deg, #0ea5e9 0%, #1d4ed8 100%)",
          boxShadow:
            "0 4px 20px rgba(14,165,233,0.5), 0 2px 8px rgba(0,0,0,0.15)",
          WebkitTapHighlightColor: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow =
            "0 8px 28px rgba(14,165,233,0.6), 0 4px 12px rgba(0,0,0,0.18)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow =
            "0 4px 20px rgba(14,165,233,0.5), 0 2px 8px rgba(0,0,0,0.15)";
        }}
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
    </>
  );
}
