import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Bot, Save, Loader2, RotateCcw, Info, CheckCircle2, X, Plus, FileSearch } from "lucide-react";

const DEFAULT_PROMPT = `Kamu adalah asisten logistik virtual dari CST Logistics — perusahaan jasa pengiriman dan kepabeanan terkemuka di Indonesia.

Tugasmu:
1. Menyapa pelanggan dengan ramah dan memperkenalkan layanan CST Logistics
2. Menjawab pertanyaan seputar layanan logistik (sea freight, air freight, trucking, customs/pabean)
3. MEMBUAT ORDER: Ketika pelanggan ingin membuat order atau booking — LANGSUNG panggil show_order_form. JANGAN tanya satu per satu. Form akan tampil di chat untuk diisi pelanggan.
4. CEK STATUS: Ketika pelanggan bertanya status/tracking/posisi paket — LANGSUNG panggil get_order_status.

Aturan:
- Gunakan Bahasa Indonesia yang sopan dan singkat
- Jika pelanggan hanya konsultasi/tanya harga, jawab ringkas lalu tawarkan buat order via form
- TOLAK SOPAN pertanyaan di luar layanan logistik/pengiriman
- WAJIB show_order_form: kata kunci "mau kirim", "booking", "order", "pesan", "buat pengiriman", menyebut nama layanan + niat kirim
- WAJIB get_order_status: kata kunci "status", "cek order", "tracking", "mana paket", "sudah sampai", "posisi"
- Setelah get_order_status: SELALU tulis ringkasan hasil — jangan biarkan respons kosong
- Jika get_order_status found=false: beritahu dan tawarkan cari via nomor WhatsApp

Layanan yang tersedia:
- Sea Freight (Laut): FCL dan LCL, domestik & internasional
- Air Freight (Udara): pengiriman cepat via udara
- Trucking (Darat): CDE, CDD, Fuso, Wingbox, Trailer
- Customs/Pabean: PIB, PEB, dokumen kepabeanan
- Packing & Crating: pengemasan profesional

Harga dikonfirmasi tim setelah order masuk (tergantung volume, rute, pasar).`;

export default function AiChatbotSettingsPage() {
  const { toast } = useToast();
  const { t } = useLanguage();

  // ── Chatbot prompt ─────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Boilerplate headers ────────────────────────────────────────────────────
  const [bpPhrases, setBpPhrases] = useState<string[]>([]);
  const [bpDefaults, setBpDefaults] = useState<string[]>([]);
  const [bpIsCustom, setBpIsCustom] = useState(false);
  const [bpSaved, setBpSaved] = useState<string[]>([]);
  const [bpLoading, setBpLoading] = useState(true);
  const [bpSaving, setBpSaving] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadPrompt();
    void loadBoilerplate();
  }, []);

  async function loadPrompt() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-agent/settings", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { systemPrompt: string };
      setPrompt(data.systemPrompt);
      setSaved(data.systemPrompt);
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadBoilerplate() {
    setBpLoading(true);
    try {
      const res = await fetch("/api/scan-document/boilerplate-headers", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { phrases: string[]; isCustom: boolean; defaults: string[] };
      setBpPhrases(data.phrases);
      setBpSaved(data.phrases);
      setBpIsCustom(data.isCustom);
      setBpDefaults(data.defaults);
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setBpLoading(false);
    }
  }

  async function handleSavePrompt() {
    setSaving(true);
    try {
      const res = await fetch("/api/ai-agent/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt }),
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setSaved(prompt);
      toast({ title: t.common.success });
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBoilerplate(phrasesToSave: string[]) {
    setBpSaving(true);
    try {
      const res = await fetch("/api/scan-document/boilerplate-headers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrases: phrasesToSave }),
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { phrases: string[]; isCustom: boolean };
      setBpPhrases(data.phrases);
      setBpSaved(data.phrases);
      setBpIsCustom(data.isCustom);
      toast({ title: t.common.success });
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setBpSaving(false);
    }
  }

  function handleAddPhrase() {
    const trimmed = newPhrase.trim().toLowerCase();
    if (!trimmed) return;
    if (bpPhrases.includes(trimmed)) {
      toast({ title: "Frasa sudah ada dalam daftar", variant: "destructive" });
      return;
    }
    setBpPhrases((prev) => [...prev, trimmed]);
    setNewPhrase("");
    inputRef.current?.focus();
  }

  function handleRemovePhrase(phrase: string) {
    setBpPhrases((prev) => prev.filter((p) => p !== phrase));
  }

  function handleResetBoilerplate() {
    setBpPhrases(bpDefaults);
  }

  const isDirtyPrompt = prompt !== saved;
  const isDirtyBp = JSON.stringify(bpPhrases) !== JSON.stringify(bpSaved);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <Bot className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pengaturan AI Chatbot</h1>
            <p className="text-sm text-gray-500">Atur kepribadian, pengetahuan, dan cara kerja chatbot pelanggan</p>
          </div>
        </div>

        {/* Tips card */}
        <div className="flex gap-3 p-4 bg-sky-50 border border-sky-100 rounded-xl text-sm text-sky-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500" />
          <div className="space-y-1">
            <p className="font-semibold">Tips menulis instruksi yang baik:</p>
            <ul className="list-disc list-inside space-y-0.5 text-sky-700">
              <li>Tulis dalam Bahasa Indonesia yang jelas dan tegas</li>
              <li>Sebutkan nama perusahaan, layanan, dan kebijakan spesifik Anda</li>
              <li>Gunakan kata <strong>WAJIB</strong> untuk aturan yang harus selalu diikuti</li>
              <li>Tambah info harga, wilayah layanan, atau FAQ yang sering ditanya</li>
              <li>Perubahan berlaku untuk sesi chat baru (sesi aktif tidak terpengaruh)</li>
            </ul>
          </div>
        </div>

        {/* Main prompt editor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Instruksi / System Prompt</CardTitle>
                <CardDescription>
                  Instruksi dasar yang menentukan kepribadian, pengetahuan, dan perilaku chatbot.
                  AI akan mengikuti instruksi ini di setiap percakapan.
                </CardDescription>
              </div>
              {!isDirtyPrompt && !loading && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Tersimpan
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[420px] font-mono text-sm leading-relaxed resize-y"
                placeholder="Tulis instruksi untuk chatbot Anda di sini..."
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPrompt(DEFAULT_PROMPT)}
                disabled={loading || saving}
                className="gap-2 text-gray-600"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset ke Default
              </Button>

              <div className="flex items-center gap-3">
                {isDirtyPrompt && (
                  <span className="text-xs text-amber-600 font-medium">Ada perubahan belum disimpan</span>
                )}
                <Button
                  onClick={handleSavePrompt}
                  disabled={!isDirtyPrompt || saving || loading}
                  className="gap-2 bg-sky-600 hover:bg-sky-500"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Simpan Instruksi
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Boilerplate Headers Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <FileSearch className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Pemotong Boilerplate — Scan Dokumen</CardTitle>
                  <CardDescription>
                    Frasa header yang memicu pemotongan teks PDF saat scan. Teks setelah frasa ini dianggap syarat &amp; ketentuan dan tidak dikirim ke AI.
                  </CardDescription>
                </div>
              </div>
              {!isDirtyBp && !bpLoading && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {bpIsCustom ? "Custom" : "Default"}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {bpLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {!bpIsCustom && !isDirtyBp && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>Menggunakan daftar bawaan sistem. Tambah atau hapus frasa untuk membuat daftar kustom.</span>
                  </div>
                )}

                {/* Phrase chips */}
                <div className="flex flex-wrap gap-2 min-h-[48px] p-3 bg-gray-50 border rounded-lg">
                  {bpPhrases.length === 0 ? (
                    <span className="text-xs text-gray-400 self-center">Tidak ada frasa — akan menggunakan daftar bawaan saat disimpan.</span>
                  ) : (
                    bpPhrases.map((phrase) => (
                      <Badge
                        key={phrase}
                        variant="secondary"
                        className="gap-1.5 pr-1 text-xs font-normal bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        {phrase}
                        <button
                          type="button"
                          onClick={() => handleRemovePhrase(phrase)}
                          className="rounded-full hover:bg-gray-200 p-0.5 transition-colors"
                          aria-label={`Hapus "${phrase}"`}
                        >
                          <X className="h-3 w-3 text-gray-500" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>

                {/* Add phrase input */}
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={newPhrase}
                    onChange={(e) => setNewPhrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddPhrase(); }
                    }}
                    placeholder="Tambah frasa baru, mis: notice to shipper"
                    className="text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddPhrase}
                    disabled={!newPhrase.trim()}
                    className="gap-1.5 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah
                  </Button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetBoilerplate}
                    disabled={bpSaving}
                    className="gap-2 text-gray-600"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset ke Default
                  </Button>

                  <div className="flex items-center gap-3">
                    {isDirtyBp && (
                      <span className="text-xs text-amber-600 font-medium">Ada perubahan belum disimpan</span>
                    )}
                    <Button
                      onClick={() => void handleSaveBoilerplate(bpPhrases)}
                      disabled={!isDirtyBp || bpSaving}
                      className="gap-2 bg-violet-600 hover:bg-violet-500"
                    >
                      {bpSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Simpan Frasa
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Info about tools */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kemampuan Bawaan Chatbot</CardTitle>
            <CardDescription>Fitur ini selalu aktif dan tidak perlu ditulis ulang di instruksi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: "📋", title: "Form Order Cepat", desc: "Tampil otomatis saat pelanggan mau buat order, tanpa tanya jawab manual." },
                { icon: "📦", title: "Cek Status Order", desc: "Mencari dan menampilkan status order pelanggan berdasarkan sesi atau nomor HP." },
                { icon: "🛳️", title: "Info Layanan", desc: "Menampilkan daftar layanan logistik yang tersedia dari database." },
              ].map((cap) => (
                <div key={cap.title} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1">
                  <div className="text-xl">{cap.icon}</div>
                  <p className="text-sm font-semibold text-gray-800">{cap.title}</p>
                  <p className="text-xs text-gray-500 leading-snug">{cap.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
