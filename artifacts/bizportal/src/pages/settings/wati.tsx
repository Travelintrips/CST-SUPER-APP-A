import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Send, RefreshCw,
  Wifi, WifiOff, MessageCircle, FileText, ChevronDown, ChevronRight,
  AlertTriangle, Info, Phone, Zap, Globe, Copy, CheckCheck, Users,
  Download,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`/api${path}`, { credentials: "include", ...opts });

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge className="gap-1 bg-emerald-600/20 text-emerald-400 border-emerald-600">
      <CheckCircle2 size={12} /> Terhubung
    </Badge>
  ) : (
    <Badge className="gap-1 bg-red-600/20 text-red-400 border-red-600">
      <XCircle size={12} /> Tidak terhubung
    </Badge>
  );
}

interface WatiStatus {
  provider: "wati" | "fonnte";
  wati: { configured: boolean; connected?: boolean; error?: string | null; baseUrl?: string | null; phone?: string | null; accountName?: string | null; phoneSource?: string | null };
  fonnte: { configured: boolean; note?: string };
}

interface WatiTemplate {
  id?: string;
  elementName?: string;
  templateName?: string;
  status?: string;
  category?: string;
  language?: string;
  body?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-1 p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
      title="Salin"
    >
      {copied ? <CheckCheck size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

export default function WatiSettingsPage() {
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<WatiStatus>({
    queryKey: ["wati-status"],
    queryFn: () => apiFetch("/wati/status").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: tplData, isLoading: tplLoading, refetch: refetchTpl } = useQuery<{ templates: WatiTemplate[] }>({
    queryKey: ["wati-templates"],
    queryFn: () => apiFetch("/wati/templates").then((r) => r.json()),
    enabled: status?.wati?.connected === true,
  });

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Halo! Ini adalah pesan test dari BizPortal via WATI. 👋");
  const [expandedTpl, setExpandedTpl] = useState<string | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; name?: string; error?: string } | null>(null);
  const [tplPhone, setTplPhone] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplParams, setTplParams] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);

  // Bulk validate state
  const [bulkInput, setBulkInput] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<{
    phone: string; valid: boolean; name?: string; error?: string;
  }[] | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{ validCount: number; invalidCount: number } | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhook/wati`;

  const testMut = useMutation({
    mutationFn: () =>
      apiFetch("/wati/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Gagal kirim");
        return j;
      }),
    onSuccess: () => toast({ title: "Pesan test berhasil dikirim!", description: `Ke: ${testPhone}` }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const selfPingMut = useMutation({
    mutationFn: () =>
      apiFetch("/wati/self-ping", { method: "POST" }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error((j.message ?? "Gagal") + (j.hint ? `\n${j.hint}` : ""));
        return j;
      }),
    onSuccess: (d) => toast({ title: "Self-ping berhasil!", description: `Pesan dikirim ke +${d.sentTo}` }),
    onError: (e: Error) => toast({ title: "Self-ping gagal", description: e.message, variant: "destructive" }),
  });

  const tplMut = useMutation({
    mutationFn: () =>
      apiFetch("/wati/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: tplPhone.trim(),
          templateName: tplName.trim(),
          params: tplParams.filter((p) => p.name && p.value),
        }),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Gagal kirim");
        return j;
      }),
    onSuccess: () => toast({ title: "Template berhasil dikirim!", description: `Template: ${tplName}` }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const validatePhone = async (phone: string) => {
    const normalized = phone.replace(/\D/g, "").replace(/^0/, "62");
    if (!normalized) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await apiFetch("/wati/validate-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setValidationResult({ valid: j.valid, name: j.name, error: j.error });
        if (j.valid) {
          toast({ title: "Nomor valid di WATI", description: j.name ? `Nama kontak: ${j.name}` : `+${normalized} ditemukan di akun WATI` });
        } else {
          toast({ title: "Nomor tidak ditemukan", description: j.error ?? "Nomor belum terdaftar sebagai kontak WATI", variant: "destructive" });
        }
      } else {
        setValidationResult({ valid: false, error: j.message ?? "Gagal validasi" });
        toast({ title: "Gagal validasi", description: j.message ?? "Error", variant: "destructive" });
      }
    } finally {
      setValidating(false);
    }
  };

  const validateBulk = async () => {
    const phones = bulkInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (phones.length === 0) return;
    if (phones.length > 100) {
      toast({ title: "Maksimal 100 nomor", variant: "destructive" });
      return;
    }
    setBulkRunning(true);
    setBulkResults(null);
    setBulkSummary(null);
    try {
      const res = await apiFetch("/wati/validate-phones-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "Gagal validasi bulk");
      setBulkResults(j.results ?? []);
      setBulkSummary({ validCount: j.validCount ?? 0, invalidCount: j.invalidCount ?? 0 });
    } catch (err: any) {
      toast({ title: "Gagal bulk validasi", description: err.message, variant: "destructive" });
    } finally {
      setBulkRunning(false);
    }
  };

  const downloadBulkCsv = () => {
    if (!bulkResults) return;
    const rows = [["Nomor", "Status", "Nama Kontak", "Keterangan"]];
    for (const r of bulkResults) {
      rows.push([r.phone, r.valid ? "Valid" : "Tidak Valid", r.name ?? "", r.error ?? ""]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wati-bulk-validasi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveManualPhone = async () => {
    const phone = manualPhone.replace(/\D/g, "").replace(/^0/, "62");
    if (!phone) return;
    setSavingPhone(true);
    try {
      const res = await apiFetch("/settings/secrets/wati_phone_number", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: phone }),
      });
      if (res.ok) {
        toast({ title: "Nomor berhasil disimpan", description: `+${phone}` });
        setManualPhone("");
        setValidationResult(null);
        refetchStatus();
      } else {
        const j = await res.json().catch(() => ({}));
        toast({ title: "Gagal menyimpan", description: (j as any).message ?? "Error", variant: "destructive" });
      }
    } finally {
      setSavingPhone(false);
    }
  };

  const clearManualPhone = async () => {
    setSavingPhone(true);
    try {
      await apiFetch("/settings/secrets/wati_phone_number", { method: "DELETE" });
      toast({ title: "Nomor manual dihapus", description: "Sistem akan coba deteksi otomatis" });
      refetchStatus();
    } finally {
      setSavingPhone(false);
    }
  };

  const templates = tplData?.templates ?? [];
  const watiOk = status?.wati?.connected === true;

  function strVal(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "string") return v || "—";
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      return String(o.text ?? o.value ?? o.key ?? JSON.stringify(v));
    }
    return String(v);
  }

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings/app-secrets">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ArrowLeft size={14} /> Kembali
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <MessageCircle size={20} className="text-green-500" />
              Integrasi WATI WhatsApp
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Konfigurasi dan pengujian WATI Business API untuk pengiriman WhatsApp
            </p>
          </div>
        </div>

        {/* Setup Guide jika belum dikonfigurasi */}
        {!status?.wati?.configured && !statusLoading && (
          <Card className="border-amber-700/40 bg-amber-950/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-300">
                <Info size={14} /> Cara Setup WATI
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <ol className="list-decimal list-inside space-y-2 text-amber-200/80">
                <li>
                  Login ke{" "}
                  <a href="https://app.wati.io" target="_blank" rel="noreferrer" className="underline text-amber-400">
                    app.wati.io
                  </a>{" "}
                  → API Docs / Developer Settings → copy <strong>API Access Token</strong> dan <strong>Base URL</strong>
                </li>
                <li>
                  Buka <Link href="/settings/app-secrets" className="underline text-amber-400">Settings → App Secrets</Link> → isi:
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-amber-300/70">
                    <li><code className="bg-amber-900/40 px-1 rounded">WATI Base URL</code> — contoh: <code>https://live-server-12345.wati.io</code></li>
                    <li><code className="bg-amber-900/40 px-1 rounded">WATI API Token</code> — token Bearer dari dashboard</li>
                  </ul>
                </li>
                <li>
                  Kembali ke halaman ini → klik <strong>Refresh</strong>
                </li>
                <li>
                  Di dashboard WATI → Settings → Webhook → masukkan URL webhook berikut:
                  <div className="mt-1 flex items-center gap-1 bg-muted/20 border rounded px-2 py-1 font-mono text-[11px]">
                    <span className="flex-1 truncate">{webhookUrl}</span>
                    <CopyButton text={webhookUrl} />
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Status Koneksi</CardTitle>
              <div className="flex items-center gap-2">
                {watiOk && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs h-7 border-emerald-700/50 text-emerald-400 hover:bg-emerald-950/40"
                    onClick={() => selfPingMut.mutate()}
                    disabled={selfPingMut.isPending}
                  >
                    {selfPingMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                    Self-Ping
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => refetchStatus()} className="gap-1 text-xs">
                  <RefreshCw size={12} /> Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 size={14} className="animate-spin" /> Memeriksa koneksi...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Provider aktif */}
                <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-3">
                    {watiOk ? <Wifi size={18} className="text-emerald-400" /> : <WifiOff size={18} className="text-red-400" />}
                    <div>
                      <p className="text-sm font-medium">
                        Provider Aktif:{" "}
                        <span className={cn("font-bold", status?.provider === "wati" ? "text-emerald-400" : "text-amber-400")}>
                          {status?.provider === "wati" ? "WATI" : "Fonnte"}
                        </span>
                      </p>
                      {status?.wati?.baseUrl && (
                        <p className="text-xs text-muted-foreground mt-0.5">{status.wati.baseUrl}</p>
                      )}
                    </div>
                  </div>
                  {status?.wati?.configured && <StatusBadge ok={watiOk} />}
                </div>

                {/* Nomor WhatsApp terhubung */}
                {watiOk && (
                  <div className="rounded-lg border bg-emerald-950/20 border-emerald-800/40 p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-600/40 flex items-center justify-center shrink-0">
                      <Phone size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Nomor WhatsApp Terhubung</p>
                      {status?.wati?.phone ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm font-bold text-emerald-300 font-mono tracking-wide">
                            +{status.wati.phone.replace(/^\+/, "")}
                          </p>
                          {status.wati.phoneSource === "manual" ? (
                            <span className="text-[10px] bg-amber-900/40 border border-amber-700/50 text-amber-400 rounded px-1">manual</span>
                          ) : status.wati.phoneSource ? (
                            <span className="text-[10px] bg-emerald-900/40 border border-emerald-700/50 text-emerald-400 rounded px-1">auto ({status.wati.phoneSource})</span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-400 mt-0.5">
                          Nomor tidak tersedia — isi manual di bawah atau cek{" "}
                          <a href="https://app.wati.io" target="_blank" rel="noreferrer" className="underline">
                            app.wati.io
                          </a>
                        </p>
                      )}
                      {status?.wati?.accountName && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{status.wati.accountName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {status?.wati?.phone && status.wati.phoneSource === "manual" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-red-400 hover:text-red-300"
                          onClick={clearManualPhone}
                          disabled={savingPhone}
                        >
                          Hapus
                        </Button>
                      )}
                      <Badge variant="outline" className="text-xs border-emerald-600/50 text-emerald-400">
                        Aktif
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Input nomor manual jika belum ada nomor */}
                {watiOk && !status?.wati?.phone && (
                  <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 space-y-2">
                    <p className="text-xs text-amber-300 font-medium flex items-center gap-1.5">
                      <Phone size={12} /> Isi Nomor WA WATI Secara Manual
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Nomor tidak terdeteksi otomatis dari API WATI. Masukkan nomor yang terdaftar di WATI (format: 628xxx).
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="628111167596"
                        value={manualPhone}
                        onChange={(e) => { setManualPhone(e.target.value); setValidationResult(null); }}
                        className="text-sm h-8 font-mono flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs border-blue-700/50 text-blue-400 hover:bg-blue-950/40"
                        disabled={!manualPhone.trim() || validating || savingPhone}
                        onClick={() => validatePhone(manualPhone)}
                      >
                        {validating ? <Loader2 size={12} className="animate-spin" /> : "Validasi"}
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!manualPhone.trim() || savingPhone}
                        onClick={saveManualPhone}
                      >
                        {savingPhone ? <Loader2 size={12} className="animate-spin" /> : "Simpan"}
                      </Button>
                    </div>
                    {validationResult !== null && (
                      <div className={cn(
                        "flex items-center gap-2 rounded px-2 py-1.5 text-xs",
                        validationResult.valid
                          ? "bg-emerald-950/40 border border-emerald-700/40 text-emerald-300"
                          : "bg-red-950/40 border border-red-700/40 text-red-300"
                      )}>
                        {validationResult.valid
                          ? <CheckCircle2 size={13} className="shrink-0" />
                          : <XCircle size={13} className="shrink-0" />}
                        <span>
                          {validationResult.valid
                            ? <>Nomor valid di WATI{validationResult.name ? <> — <strong>{validationResult.name}</strong></> : ""}</>
                            : validationResult.error ?? "Nomor tidak ditemukan"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Ganti nomor manual jika sudah ada */}
                {watiOk && status?.wati?.phone && status.wati.phoneSource === "manual" && (
                  <div className="rounded-lg border border-slate-700/40 bg-slate-900/20 p-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Ganti Nomor Manual</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="628111167596"
                        value={manualPhone}
                        onChange={(e) => { setManualPhone(e.target.value); setValidationResult(null); }}
                        className="text-sm h-8 font-mono flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs border-blue-700/50 text-blue-400 hover:bg-blue-950/40"
                        disabled={!manualPhone.trim() || validating || savingPhone}
                        onClick={() => validatePhone(manualPhone)}
                      >
                        {validating ? <Loader2 size={12} className="animate-spin" /> : "Validasi"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        disabled={!manualPhone.trim() || savingPhone}
                        onClick={saveManualPhone}
                      >
                        {savingPhone ? <Loader2 size={12} className="animate-spin" /> : "Simpan"}
                      </Button>
                    </div>
                    {validationResult !== null && (
                      <div className={cn(
                        "flex items-center gap-2 rounded px-2 py-1.5 text-xs",
                        validationResult.valid
                          ? "bg-emerald-950/40 border border-emerald-700/40 text-emerald-300"
                          : "bg-red-950/40 border border-red-700/40 text-red-300"
                      )}>
                        {validationResult.valid
                          ? <CheckCircle2 size={13} className="shrink-0" />
                          : <XCircle size={13} className="shrink-0" />}
                        <span>
                          {validationResult.valid
                            ? <>Nomor valid di WATI{validationResult.name ? <> — <strong>{validationResult.name}</strong></> : ""}</>
                            : validationResult.error ?? "Nomor tidak ditemukan"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {status?.wati?.error && (
                  <div className="flex items-start gap-2 rounded-md border border-red-600/50 bg-red-900/20 px-3 py-2 text-sm text-red-300">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <p>{status.wati.error}</p>
                  </div>
                )}

                {/* WATI belum dikonfigurasi */}
                {!status?.wati?.configured && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-600/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">WATI belum dikonfigurasi</p>
                      <p className="text-xs mt-1 text-amber-400">
                        Isi <code className="bg-amber-900/40 px-1 rounded">WATI Base URL</code> dan{" "}
                        <code className="bg-amber-900/40 px-1 rounded">WATI API Token</code> di{" "}
                        <Link href="/settings/app-secrets" className="underline">App Secrets</Link>.
                        Saat ini menggunakan Fonnte.
                      </p>
                    </div>
                  </div>
                )}

                {/* Grid status */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded border bg-muted/10 p-2 space-y-1">
                    <p className="font-medium text-green-400 flex items-center gap-1">
                      <MessageCircle size={11} /> WATI
                    </p>
                    <p className="text-muted-foreground">
                      Dikonfigurasi: <span className={status?.wati?.configured ? "text-emerald-400" : "text-red-400"}>
                        {status?.wati?.configured ? "Ya" : "Tidak"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Tersambung: <span className={watiOk ? "text-emerald-400" : "text-muted-foreground"}>
                        {status?.wati?.configured ? (watiOk ? "Ya" : "Tidak") : "—"}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-[10px] mt-1">
                      Digunakan untuk: pesan ke nomor personal
                    </p>
                  </div>
                  <div className="rounded border bg-muted/10 p-2 space-y-1">
                    <p className="font-medium text-amber-400 flex items-center gap-1">
                      <MessageCircle size={11} /> Fonnte
                    </p>
                    <p className="text-muted-foreground">
                      Dikonfigurasi: <span className={status?.fonnte?.configured ? "text-emerald-400" : "text-red-400"}>
                        {status?.fonnte?.configured ? "Ya" : "Tidak"}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-[10px] mt-1">
                      {status?.fonnte?.note ?? "Digunakan sebagai fallback"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Webhook URL Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe size={14} className="text-blue-400" />
              Webhook URL (Terima Pesan Masuk)
            </CardTitle>
            <CardDescription className="text-xs">
              Daftarkan URL ini di dashboard WATI → Settings → Webhook agar pesan masuk diteruskan ke BizPortal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 bg-muted/20 border rounded px-3 py-2 font-mono text-xs">
              <span className="flex-1 break-all">{webhookUrl}</span>
              <CopyButton text={webhookUrl} />
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>Pesan masuk via WATI akan:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>Diproses oleh <strong>AI Order Intake</strong> jika aktif</li>
                <li>Diteruskan ke <strong>grup WA admin</strong> via Fonnte jika AI intake tidak aktif</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Test Kirim (Session) */}
        {status?.wati?.configured && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Send size={14} className="text-green-400" />
                Test Kirim Pesan (Session Message)
              </CardTitle>
              <CardDescription className="text-xs">
                Kirim pesan bebas. Hanya berfungsi jika nomor tujuan sudah menghubungi WATI dalam 24 jam terakhir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor WhatsApp Tujuan</Label>
                  <Input
                    placeholder="628xxxxxxxxxx"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pesan</Label>
                <Input
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!testPhone.trim() || !testMessage.trim() || testMut.isPending || !watiOk}
                  onClick={() => testMut.mutate()}
                  className="gap-1"
                >
                  {testMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Kirim Test
                </Button>
                {watiOk && status?.wati?.phone && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selfPingMut.isPending}
                    onClick={() => {
                      setTestPhone(status.wati.phone ?? "");
                      setTestMessage("[BizPortal Test] Pesan test ke nomor WATI sendiri 🔔");
                    }}
                    className="gap-1 text-xs"
                  >
                    <Zap size={12} /> Isi nomor WATI sendiri
                  </Button>
                )}
              </div>
              {!watiOk && status?.wati?.configured && (
                <p className="text-xs text-amber-400">Koneksi WATI belum aktif — periksa token dan base URL.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Kirim Template */}
        {watiOk && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText size={14} className="text-blue-400" />
                Kirim Template Message (HSM)
              </CardTitle>
              <CardDescription className="text-xs">
                Template harus sudah approved di dashboard WATI. Bisa dikirim kapan saja tanpa batasan 24 jam.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor WhatsApp</Label>
                  <Input
                    placeholder="628xxxxxxxxxx"
                    value={tplPhone}
                    onChange={(e) => setTplPhone(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Template</Label>
                  <Input
                    placeholder="nama_template_approved"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Parameter Template</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6 px-2"
                    onClick={() => setTplParams((prev) => [...prev, { name: "", value: "" }])}
                  >
                    + Tambah
                  </Button>
                </div>
                <div className="space-y-2">
                  {tplParams.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="name (e.g. 1)"
                        value={p.name}
                        onChange={(e) => {
                          const updated = [...tplParams];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setTplParams(updated);
                        }}
                        className="text-xs h-8"
                      />
                      <Input
                        placeholder="value"
                        value={p.value}
                        onChange={(e) => {
                          const updated = [...tplParams];
                          updated[i] = { ...updated[i], value: e.target.value };
                          setTplParams(updated);
                        }}
                        className="text-xs h-8"
                      />
                      {tplParams.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-red-400 hover:text-red-300"
                          onClick={() => setTplParams((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                disabled={!tplPhone.trim() || !tplName.trim() || tplMut.isPending}
                onClick={() => tplMut.mutate()}
                className="gap-1"
              >
                {tplMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Kirim Template
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Bulk Validasi Nomor */}
        {watiOk && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users size={14} className="text-purple-400" />
                Bulk Validasi Nomor
              </CardTitle>
              <CardDescription className="text-xs">
                Cek beberapa nomor WA sekaligus — apakah sudah terdaftar sebagai kontak di akun WATI.
                Paste nomor (satu per baris, atau pisahkan dengan koma). Maks. 100 nomor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={"628111167596\n628222345678\n628333456789"}
                value={bulkInput}
                onChange={(e) => { setBulkInput(e.target.value); setBulkResults(null); setBulkSummary(null); }}
                className="font-mono text-xs min-h-[96px] resize-y"
                disabled={bulkRunning}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!bulkInput.trim() || bulkRunning}
                  onClick={validateBulk}
                >
                  {bulkRunning
                    ? <><Loader2 size={13} className="animate-spin" /> Memvalidasi…</>
                    : <><CheckCircle2 size={13} /> Validasi Semua</>}
                </Button>
                {bulkResults && bulkResults.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={downloadBulkCsv}
                  >
                    <Download size={12} /> Export CSV
                  </Button>
                )}
                {bulkSummary && (
                  <div className="flex items-center gap-2 ml-auto text-xs">
                    <span className="text-emerald-400 font-medium">{bulkSummary.validCount} valid</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-red-400 font-medium">{bulkSummary.invalidCount} tidak valid</span>
                  </div>
                )}
              </div>

              {bulkRunning && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  Memvalidasi nomor satu per satu ke WATI API…
                </div>
              )}

              {bulkResults && bulkResults.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-xs py-2">Nomor</TableHead>
                        <TableHead className="text-xs py-2">Status</TableHead>
                        <TableHead className="text-xs py-2">Nama Kontak</TableHead>
                        <TableHead className="text-xs py-2">Keterangan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkResults.map((r, i) => (
                        <TableRow key={i} className={r.valid ? "bg-emerald-950/10" : "bg-red-950/10"}>
                          <TableCell className="text-xs font-mono py-1.5">+{r.phone}</TableCell>
                          <TableCell className="py-1.5">
                            {r.valid ? (
                              <Badge className="text-[10px] gap-1 bg-emerald-600/20 text-emerald-400 border-emerald-600">
                                <CheckCircle2 size={10} /> Valid
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] gap-1 bg-red-600/20 text-red-400 border-red-600">
                                <XCircle size={10} /> Tidak Valid
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">{r.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-xs py-1.5 text-muted-foreground">{r.error ?? ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Daftar Template dari WATI */}
        {watiOk && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText size={14} />
                  Template Terdaftar di WATI
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => refetchTpl()} className="gap-1 text-xs">
                  <RefreshCw size={12} /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tplLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 size={14} className="animate-spin" /> Memuat template...
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada template ditemukan.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nama</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Kategori</TableHead>
                      <TableHead className="text-xs">Bahasa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((tpl, i) => {
                      const key = strVal(tpl.elementName ?? tpl.templateName) !== "—"
                        ? strVal(tpl.elementName ?? tpl.templateName)
                        : String(i);
                      const statusStr = strVal(tpl.status);
                      const isExpanded = expandedTpl === key;
                      return (
                        <>
                          <TableRow
                            key={key}
                            className="cursor-pointer hover:bg-muted/10"
                            onClick={() => setExpandedTpl(isExpanded ? null : key)}
                          >
                            <TableCell className="text-xs font-mono">
                              <div className="flex items-center gap-1">
                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {strVal(tpl.elementName ?? tpl.templateName)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  "text-[10px]",
                                  statusStr === "APPROVED"
                                    ? "bg-emerald-600/20 text-emerald-400 border-emerald-600"
                                    : statusStr === "REJECTED"
                                    ? "bg-red-600/20 text-red-400 border-red-600"
                                    : "bg-amber-600/20 text-amber-400 border-amber-600"
                                )}
                              >
                                {statusStr}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{strVal(tpl.category)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{strVal(tpl.language)}</TableCell>
                          </TableRow>
                          {isExpanded && tpl.body && (
                            <TableRow key={`${key}-body`} className="bg-muted/5">
                              <TableCell colSpan={4} className="text-xs text-muted-foreground py-2 px-4">
                                <pre className="whitespace-pre-wrap font-sans text-[11px]">{strVal(tpl.body)}</pre>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
