import { useState, useRef, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bot, Send, User, Package, FileText, Hash, ClipboardList,
  Users, Calculator, CheckCircle2, Circle, Loader2,
  RefreshCw, ChevronRight, Ship, Plane, AlertCircle, Copy,
  Download, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  toolCards?: ToolCard[];
}

interface ToolCard {
  name: string;
  data: unknown;
}

interface PipelineStep {
  id: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  toolName: string;
  status: "pending" | "active" | "done";
}

// ─── Pipeline Steps ─────────────────────────────────────────────────────────

const INITIAL_STEPS: PipelineStep[] = [
  { id: "identify",   label: "Identifikasi Kebutuhan", desc: "Komoditas, rute, dan moda pengiriman",     icon: Package,       toolName: "__user__",           status: "pending" },
  { id: "documents",  label: "Dokumen Import",          desc: "Packing list, invoice, HS Code, B/L",     icon: FileText,      toolName: "request_documents",  status: "pending" },
  { id: "hs_code",    label: "Kode HS",                 desc: "Kode tarif bea cukai Indonesia",           icon: Hash,          toolName: "lookup_hs_code",     status: "pending" },
  { id: "rfq",        label: "Generate RFQ",            desc: "Draft Request for Quotation",              icon: ClipboardList, toolName: "generate_import_rfq",status: "pending" },
  { id: "vendors",    label: "Rekomendasi Vendor",      desc: "Freight forwarder yang sesuai",            icon: Users,         toolName: "recommend_vendors",  status: "pending" },
  { id: "estimate",   label: "Estimasi Biaya",          desc: "Freight + bea masuk + pajak impor",        icon: Calculator,    toolName: "estimate_cost",      status: "pending" },
];

// ─── Tool Card Renderers ───────────────────────────────────────────────────────

function DocChecklist({ data }: { data: any }) {
  return (
    <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3 mt-2">
      <div className="flex items-center gap-2 font-semibold text-sm text-blue-900 dark:text-blue-100">
        <FileText className="h-4 w-4" />
        Checklist Dokumen Import — {data.commodity} dari {data.origin}
      </div>
      <div className="space-y-2">
        {data.checklist?.map((doc: any) => (
          <div key={doc.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-white dark:bg-blue-950/50 border border-blue-100 dark:border-blue-800">
            <span className="text-lg leading-none mt-0.5">{doc.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{doc.label}</span>
                {doc.required
                  ? <Badge className="text-[10px] py-0 bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Wajib</Badge>
                  : <Badge variant="outline" className="text-[10px] py-0 text-green-700 border-green-200">Opsional</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{doc.desc}</div>
            </div>
          </div>
        ))}
      </div>
      {data.tips?.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1.5">💡 Tips</div>
          <ul className="space-y-1">
            {data.tips.map((t: string, i: number) => (
              <li key={i} className="text-xs text-amber-900 dark:text-amber-100 flex gap-1.5">
                <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 text-amber-500" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HsCodeCard({ data }: { data: any }) {
  const { toast } = useToast();
  return (
    <div className="rounded-xl border bg-purple-50 dark:bg-purple-950/30 p-4 space-y-3 mt-2">
      <div className="flex items-center gap-2 font-semibold text-sm text-purple-900 dark:text-purple-100">
        <Hash className="h-4 w-4" />
        Rekomendasi HS Code — {data.commodity}
      </div>
      <div className="space-y-2">
        {data.suggestions?.map((s: any, i: number) => (
          <div key={i} className={`p-3 rounded-lg border ${i === 0 ? "bg-white dark:bg-purple-950/50 border-purple-200 dark:border-purple-700 ring-1 ring-purple-300" : "bg-white/60 dark:bg-purple-950/30 border-purple-100 dark:border-purple-800"}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm tracking-wider text-purple-800 dark:text-purple-200">{s.hsCode}</span>
                <Badge variant={s.confidence === "high" ? "default" : "secondary"} className="text-[10px] py-0">
                  {s.confidence === "high" ? "✓ Confident" : s.confidence === "medium" ? "~ Perkiraan" : "? Cek lagi"}
                </Badge>
                {i === 0 && <Badge className="text-[10px] py-0 bg-green-100 text-green-700 hover:bg-green-100">Rekomendasi</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs font-semibold text-orange-600 border-orange-200">
                  Bea Masuk: {s.dutyRate}
                </Badge>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => { navigator.clipboard.writeText(s.hsCode); toast({ title: "HS Code disalin" }); }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
            {s.notes && <div className="text-xs text-purple-700 dark:text-purple-300 mt-1 italic">{s.notes}</div>}
          </div>
        ))}
      </div>
      {data.warning && (
        <div className="flex gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5 border border-amber-200">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          {data.warning}
        </div>
      )}
      <a
        href="https://btki.insw.go.id" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> Verifikasi di BTKI 2022
      </a>
    </div>
  );
}

function RfqCard({ data }: { data: any }) {
  const { toast } = useToast();
  const d = data.details ?? {};
  const ModeIcon = d.mode === "Air Freight" ? Plane : Ship;
  return (
    <div className="rounded-xl border bg-green-50 dark:bg-green-950/30 p-4 space-y-3 mt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-green-900 dark:text-green-100">
          <ClipboardList className="h-4 w-4" />
          Draft RFQ Impor
        </div>
        <div className="flex items-center gap-2">
          <Badge className="font-mono text-xs bg-green-100 text-green-800 hover:bg-green-100">{data.rfqNumber}</Badge>
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Draft</Badge>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => { navigator.clipboard.writeText(data.rfqNumber); toast({ title: "Nomor RFQ disalin" }); }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          { label: "Komoditas",  value: d.commodity },
          { label: "Asal",       value: d.origin },
          { label: "Tujuan",     value: d.destination },
          { label: "Moda",       value: <span className="flex items-center gap-1"><ModeIcon className="h-3.5 w-3.5" />{d.mode}</span> },
          { label: "HS Code",    value: d.hsCode },
          { label: "Berat",      value: d.weight },
          { label: "Volume",     value: d.volume },
          { label: "Jumlah",     value: d.quantity },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-white dark:bg-green-950/50 border border-green-100 dark:border-green-800 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="text-sm font-medium mt-0.5">{value || "—"}</div>
          </div>
        ))}
      </div>
      {data.nextSteps?.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-green-800 dark:text-green-200">Langkah selanjutnya:</div>
          {data.nextSteps.map((s: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs text-green-900 dark:text-green-100">
              <span className="h-4 w-4 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>
              {s}
            </div>
          ))}
        </div>
      )}
      {d.notes && <div className="text-xs text-muted-foreground italic">Catatan: {d.notes}</div>}
    </div>
  );
}

function VendorCard({ data }: { data: any }) {
  return (
    <div className="rounded-xl border bg-orange-50 dark:bg-orange-950/30 p-4 space-y-3 mt-2">
      <div className="flex items-center gap-2 font-semibold text-sm text-orange-900 dark:text-orange-100">
        <Users className="h-4 w-4" />
        Vendor Freight untuk {data.mode} — dari {data.origin ?? "China"}
      </div>
      {data.vendors?.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          {data.note ?? "Belum ada vendor terdaftar"}
        </div>
      ) : (
        <div className="space-y-2">
          {data.vendors?.map((v: any) => (
            <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-orange-950/50 border border-orange-100 dark:border-orange-800">
              <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-lg flex-shrink-0">
                {v.logo ?? "🏢"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{v.name}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[10px] py-0">{v.serviceType}</Badge>
                  {v.eta && <Badge variant="secondary" className="text-[10px] py-0">ETA: {v.eta}</Badge>}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                {v.phone && <div>{v.phone}</div>}
                {v.email && <div className="text-blue-600">{v.email}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EstimateCard({ data }: { data: any }) {
  const ModeIcon = data.mode === "Air Freight" ? Plane : Ship;
  const fmt = (n: number) => n.toLocaleString("id-ID");
  return (
    <div className="rounded-xl border bg-teal-50 dark:bg-teal-950/30 p-4 space-y-3 mt-2">
      <div className="flex items-center gap-2 font-semibold text-sm text-teal-900 dark:text-teal-100">
        <Calculator className="h-4 w-4" />
        Estimasi Biaya — <ModeIcon className="h-4 w-4 inline" /> {data.mode}
      </div>
      {data.error ? (
        <div className="text-sm text-destructive">{data.error}<br /><span className="text-xs text-muted-foreground">{data.hint}</span></div>
      ) : (
        <>
          <div className="rounded-lg bg-white dark:bg-teal-950/50 border border-teal-200 dark:border-teal-700 p-3">
            <div className="text-xs text-muted-foreground mb-1">Estimasi Biaya Freight</div>
            <div className="text-2xl font-bold text-teal-700 dark:text-teal-300">
              ${data.freight?.min?.toLocaleString()} – ${data.freight?.max?.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{data.freight?.unit}</div>
            <div className="text-xs text-muted-foreground italic mt-1">{data.freight?.note}</div>
          </div>
          {data.customs && !data.customs.note?.startsWith("Tambahkan") && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white dark:bg-teal-950/50 border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase">Nilai Invoice</div>
                <div className="font-semibold text-sm">${data.customs.invoiceUsd?.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-teal-950/50 border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase">Est. Bea Masuk</div>
                <div className="font-semibold text-sm text-orange-600">Rp {fmt(data.customs.estimatedBmIdr)}</div>
              </div>
              <div className="rounded-lg bg-white dark:bg-teal-950/50 border p-2.5 col-span-2">
                <div className="text-[10px] text-muted-foreground uppercase">Est. Total Pajak Impor</div>
                <div className="font-semibold text-sm text-red-600">
                  Rp {fmt(data.customs.estimatedTaxIdr?.min)} – Rp {fmt(data.customs.estimatedTaxIdr?.max)}
                </div>
                <div className="text-[10px] text-muted-foreground">{data.customs.note}</div>
              </div>
            </div>
          )}
          {data.customs?.note?.startsWith("Tambahkan") && (
            <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 border border-amber-200">
              💡 {data.customs.note}
            </div>
          )}
          <div className="text-xs text-muted-foreground italic flex gap-1.5">
            <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
            {data.disclaimer}
          </div>
        </>
      )}
    </div>
  );
}

function renderToolCard(card: ToolCard) {
  const d = card.data as any;
  if (!d) return null;
  if (card.name === "request_documents")  return <DocChecklist  key={card.name} data={d} />;
  if (card.name === "lookup_hs_code")     return <HsCodeCard    key={card.name} data={d} />;
  if (card.name === "generate_import_rfq") return <RfqCard      key={card.name} data={d} />;
  if (card.name === "recommend_vendors")  return <VendorCard    key={card.name} data={d} />;
  if (card.name === "estimate_cost")      return <EstimateCard  key={card.name} data={d} />;
  return null;
}

// ─── Starter Prompts ───────────────────────────────────────────────────────────

const STARTERS = [
  "Saya mau import mesin dari China",
  "Import tekstil 500 kg dari Guangzhou, moda laut",
  "Berapa biaya import elektronik 200 kg dari Shenzhen via udara?",
  "Saya butuh HS Code untuk mesin CNC dari China",
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function LogisticsImportAssistantPage() {
  const [messages, setMessages]     = useState<ChatMsg[]>([]);
  const [pipeline, setPipeline]     = useState<PipelineStep[]>(INITIAL_STEPS);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const scrollRef                   = useRef<HTMLDivElement>(null);
  const abortRef                    = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const markStep = useCallback((toolName: string) => {
    setPipeline((prev) => prev.map((s) =>
      s.toolName === toolName ? { ...s, status: "done" } : s,
    ));
  }, []);

  const markActive = useCallback((toolName: string) => {
    setPipeline((prev) => prev.map((s) =>
      s.toolName === toolName ? { ...s, status: "active" } : s,
    ));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: ChatMsg = { role: "user", content: text };
    const assistantMsg: ChatMsg = { role: "assistant", content: "", toolCards: [] };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    markStep("__user__");

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    abortRef.current = new AbortController();

    try {
      const resp = await fetch("/api/import-advisor/chat", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ messages: apiMessages }),
        signal:      abortRef.current.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream body");

      const decoder   = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === "delta") {
            const chunk = event.text as string;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { ...last, content: last.content + chunk };
              }
              return copy;
            });
          } else if (event.type === "tool_start") {
            markActive(event.name as string);
          } else if (event.type === "tool_result") {
            const name = event.name as string;
            const data = event.data;
            markStep(name);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  toolCards: [...(last.toolCards ?? []), { name, data }],
                };
              }
              return copy;
            });
          } else if (event.type === "error") {
            toast({ title: "Error", description: event.message as string, variant: "destructive" });
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        toast({ title: "Koneksi gagal", description: "Coba lagi atau refresh halaman.", variant: "destructive" });
      }
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming, markStep, markActive, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setPipeline(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));
    setInput("");
    setStreaming(false);
  };

  const completedCount = pipeline.filter((s) => s.status === "done").length;

  return (
    <AppShell>
      <div className="h-[calc(100vh-64px)] flex flex-col">

        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">AI Import Advisor</h1>
              <p className="text-xs text-muted-foreground">Asisten impor otomatis — dari kebutuhan hingga RFQ siap kirim</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground hidden sm:block">
              {completedCount}/{pipeline.length} langkah selesai
            </div>
            <Button variant="outline" size="sm" onClick={resetChat} className="gap-1.5 text-xs h-8">
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>

        {/* Main body */}
        <div className="flex-1 flex overflow-hidden">

          {/* Chat Panel */}
          <div className="flex-1 flex flex-col min-w-0 border-r">

            {/* Message list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>

              {/* Welcome state */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-teal-100 dark:from-blue-900 dark:to-teal-900 flex items-center justify-center">
                    <Ship className="h-8 w-8 text-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold">Mau impor apa hari ini?</h2>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Ceritakan kebutuhanmu — AI akan otomatis minta dokumen, cari HS Code, buat RFQ, dan estimasi biaya.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="text-left text-xs p-3 rounded-xl border bg-muted/40 hover:bg-muted transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5
                    ${msg.role === "user"
                      ? "bg-primary"
                      : "bg-gradient-to-br from-blue-500 to-teal-500"
                    }`}
                  >
                    {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>

                  <div className={`flex-1 min-w-0 ${msg.role === "user" ? "flex flex-col items-end" : ""}`}>
                    {msg.content && (
                      <div className={`inline-block max-w-full rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap
                        ${msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted rounded-tl-sm"
                        }`}
                      >
                        {msg.content}
                        {streaming && i === messages.length - 1 && msg.role === "assistant" && !msg.content && (
                          <span className="inline-flex gap-1 ml-1">
                            <span className="animate-bounce delay-0">·</span>
                            <span className="animate-bounce delay-100">·</span>
                            <span className="animate-bounce delay-200">·</span>
                          </span>
                        )}
                      </div>
                    )}

                    {streaming && i === messages.length - 1 && msg.role === "assistant" && !msg.content && (
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Memproses...
                      </div>
                    )}

                    {/* Tool cards */}
                    {msg.toolCards?.map((card, j) => (
                      <div key={j} className="w-full mt-1">
                        {renderToolCard(card)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Input box */}
            <div className="flex-shrink-0 p-4 border-t bg-background">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ceritakan kebutuhan import Anda... (Enter untuk kirim)"
                  className="flex-1 min-h-[42px] max-h-32 resize-none text-sm"
                  disabled={streaming}
                  rows={1}
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || streaming}
                  className="flex-shrink-0 h-[42px] px-4"
                >
                  {streaming
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </form>
              <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                AI dapat membuat kesalahan. Verifikasi HS Code & bea masuk di beacukai.go.id
              </p>
            </div>
          </div>

          {/* Pipeline Tracker */}
          <div className="w-72 flex-shrink-0 flex flex-col bg-muted/20">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm">Pipeline Import</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Progress alur kerja otomatis</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 rounded-full h-1.5 bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-teal-500 transition-all duration-700"
                    style={{ width: `${(completedCount / pipeline.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {completedCount}/{pipeline.length}
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {pipeline.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.id}>
                      <div className={`rounded-xl p-3 border transition-all duration-300
                        ${step.status === "done"
                          ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                          : step.status === "active"
                            ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 ring-1 ring-blue-300"
                            : "bg-background border-border opacity-60"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center
                            ${step.status === "done"
                              ? "bg-green-500 text-white"
                              : step.status === "active"
                                ? "bg-blue-500 text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {step.status === "done"
                              ? <CheckCircle2 className="h-4 w-4" />
                              : step.status === "active"
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Icon className="h-3.5 w-3.5" />
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-medium ${step.status === "done" ? "text-green-800 dark:text-green-200" : step.status === "active" ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground"}`}>
                              {step.label}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {step.desc}
                            </div>
                          </div>
                        </div>
                      </div>
                      {i < pipeline.length - 1 && (
                        <div className="flex justify-center my-1">
                          <div className={`w-px h-4 ${step.status === "done" ? "bg-green-300" : "bg-border"}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Completed summary */}
            {completedCount === pipeline.length && (
              <div className="p-4 border-t">
                <div className="rounded-xl bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/30 dark:to-teal-950/30 border border-green-200 dark:border-green-800 p-4 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-green-800 dark:text-green-200">Pipeline Selesai!</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    RFQ siap dikirim ke vendor
                  </div>
                  <Button size="sm" className="mt-3 w-full gap-1.5 text-xs h-7" asChild>
                    <a href="/logistics/rfq">
                      Lihat Semua RFQ <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {/* Info box */}
            <div className="p-4 border-t">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">Cara penggunaan:</div>
                <div className="flex gap-1.5"><ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5" /> Ketik kebutuhan impor Anda</div>
                <div className="flex gap-1.5"><ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5" /> AI otomatis jalankan setiap langkah</div>
                <div className="flex gap-1.5"><ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5" /> Review & konfirmasi di setiap step</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
