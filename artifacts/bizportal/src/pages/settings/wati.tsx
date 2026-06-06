import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Send, RefreshCw,
  Wifi, WifiOff, MessageCircle, FileText, ChevronDown, ChevronRight,
  AlertTriangle, Info, Phone,
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

  const [tplPhone, setTplPhone] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplParams, setTplParams] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);

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

        {/* Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Status Koneksi</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchStatus()} className="gap-1 text-xs">
                <RefreshCw size={12} /> Refresh
              </Button>
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
                          {status.wati.phoneSource === "manual" && (
                            <span className="text-[10px] bg-amber-900/40 border border-amber-700/50 text-amber-400 rounded px-1">manual</span>
                          )}
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
                        onChange={(e) => setManualPhone(e.target.value)}
                        className="text-sm h-8 font-mono flex-1"
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!manualPhone.trim() || savingPhone}
                        onClick={saveManualPhone}
                      >
                        {savingPhone ? <Loader2 size={12} className="animate-spin" /> : "Simpan"}
                      </Button>
                    </div>
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
                        onChange={(e) => setManualPhone(e.target.value)}
                        className="text-sm h-8 font-mono flex-1"
                      />
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
                        Set environment variable <code className="bg-amber-900/40 px-1 rounded">WATI_API_TOKEN</code> dan{" "}
                        <code className="bg-amber-900/40 px-1 rounded">WATI_BASE_URL</code> di Replit Secrets untuk mengaktifkan WATI.
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

        {/* Test Kirim (Session) */}
        {status?.wati?.configured && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Send size={14} className="text-green-400" />
                Test Kirim Pesan (Session Message)
              </CardTitle>
              <CardDescription className="text-xs">
                Kirim pesan bebas. Hanya berfungsi jika pelanggan sudah menghubungi dalam 24 jam terakhir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor WhatsApp</Label>
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
              <Button
                size="sm"
                disabled={!testPhone.trim() || !testMessage.trim() || testMut.isPending || !watiOk}
                onClick={() => testMut.mutate()}
                className="gap-1"
              >
                {testMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Kirim Test
              </Button>
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

              {/* Params */}
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
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 size={14} className="animate-spin" /> Memuat template...
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Tidak ada template ditemukan.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Nama Template</TableHead>
                        <TableHead className="text-xs">Kategori</TableHead>
                        <TableHead className="text-xs">Bahasa</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((t, idx) => {
                        const name = t.elementName ?? t.templateName ?? `template-${idx}`;
                        const isExpanded = expandedTpl === name;
                        const cat = typeof t.category === "object" ? JSON.stringify(t.category) : (t.category ?? "—");
                        const lang = typeof t.language === "object" ? JSON.stringify(t.language) : (t.language ?? "—");
                        const status = typeof t.status === "object" ? JSON.stringify(t.status) : (t.status ?? "—");
                        const bodyText = typeof t.body === "object" ? JSON.stringify(t.body, null, 2) : (t.body ?? "");
                        return (
                          <Fragment key={name}>
                            <TableRow className="cursor-pointer" onClick={() => setExpandedTpl(isExpanded ? null : name)}>
                              <TableCell className="text-xs font-mono">{name}</TableCell>
                              <TableCell className="text-xs">{cat}</TableCell>
                              <TableCell className="text-xs">{lang}</TableCell>
                              <TableCell className="text-xs">
                                <Badge
                                  variant="outline"
                                  className={cn("text-xs", status === "APPROVED"
                                    ? "border-emerald-600 text-emerald-400"
                                    : status === "PENDING"
                                    ? "border-amber-600 text-amber-400"
                                    : "border-red-600 text-red-400"
                                  )}
                                >
                                  {status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </TableCell>
                            </TableRow>
                            {isExpanded && bodyText && (
                              <TableRow>
                                <TableCell colSpan={5} className="bg-muted/10">
                                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono p-2 rounded">
                                    {bodyText}
                                  </pre>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Catatan Teknis */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Catatan Teknis</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>• <strong className="text-foreground">WATI</strong> digunakan untuk pesan ke nomor personal (individual WhatsApp Business).</p>
            <p>• <strong className="text-foreground">Fonnte</strong> tetap digunakan untuk notifikasi ke <em>grup WA admin</em> (WATI tidak support grup).</p>
            <p>• <strong className="text-foreground">Session message</strong> (pesan bebas) hanya bisa dikirim dalam 24 jam setelah pelanggan menghubungi.</p>
            <p>• <strong className="text-foreground">Template message (HSM)</strong> bisa dikirim kapan saja — template harus sudah approved di dashboard WATI.</p>
            <p>• Semua pengiriman tercatat di <Link href="/settings/wa-notification-logs" className="underline text-primary">WA Notification Logs</Link>.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
