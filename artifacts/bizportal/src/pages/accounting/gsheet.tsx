import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, Upload, Download, ExternalLink, CheckCircle2,
  AlertCircle, Loader2, TableIcon, FileSpreadsheet, Info, ArrowLeft,
  PackageSearch, CalendarDays,
} from "lucide-react";
import { Link } from "wouter";

type Config = { spreadsheetId: string | null };
type PushResult = { ok: boolean; spreadsheetId: string; spreadsheetUrl: string; pushed: { accounts: number; entries: number; lines: number } };
type PullResult = { ok: boolean; coaAdded: number; coaUpdated: number; entriesAdded: number; errors: string[] };
type SetupResult = { ok: boolean; spreadsheetId: string; spreadsheetUrl: string | null };
type ExportOrdersResult = { ok: boolean; total: number; spreadsheetId: string; spreadsheetUrl: string };

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

async function apiFetch<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? data.error ?? "Gagal");
  return data as T;
}

export default function AccountingGSheetPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [customId, setCustomId] = useState("");
  const [lastPush, setLastPush] = useState<PushResult | null>(null);
  const [lastPull, setLastPull] = useState<PullResult | null>(null);

  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [lastExport, setLastExport] = useState<ExportOrdersResult | null>(null);

  const { data: config, isLoading: configLoading } = useQuery<Config>({
    queryKey: ["accounting-gsheet-config"],
    queryFn: () => apiFetch("/api/accounting/gsheet/config"),
  });

  const setupMut = useMutation({
    mutationFn: (spreadsheetId?: string) =>
      apiFetch<SetupResult>("/api/accounting/gsheet/setup", "POST", spreadsheetId ? { spreadsheetId } : {}),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["accounting-gsheet-config"] });
      toast({ title: "Berhasil", description: d.spreadsheetUrl ? "Spreadsheet baru dibuat." : "Spreadsheet ID disimpan." });
      setCustomId("");
    },
    onError: (e) => toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" }),
  });

  const pushMut = useMutation({
    mutationFn: () => apiFetch<PushResult>("/api/accounting/gsheet/push", "POST"),
    onSuccess: (d) => {
      setLastPush(d);
      toast({ title: "Push berhasil", description: `${d.pushed.accounts} akun, ${d.pushed.entries} entri dikirim ke Sheets.` });
    },
    onError: (e) => toast({ title: "Push gagal", description: (e as Error).message, variant: "destructive" }),
  });

  const pullMut = useMutation({
    mutationFn: () => apiFetch<PullResult>("/api/accounting/gsheet/pull", "POST"),
    onSuccess: (d) => {
      setLastPull(d);
      toast({ title: "Pull berhasil", description: `${d.coaAdded} akun baru, ${d.coaUpdated} diperbarui, ${d.entriesAdded} entri draft dibuat.` });
    },
    onError: (e) => toast({ title: "Pull gagal", description: (e as Error).message, variant: "destructive" }),
  });

  const exportOrdersMut = useMutation({
    mutationFn: () =>
      apiFetch<ExportOrdersResult>("/api/logistic/orders/export-gsheet", "POST", {
        dateFrom: exportDateFrom || undefined,
        dateTo: exportDateTo || undefined,
        status: exportStatus || undefined,
      }),
    onSuccess: (d) => {
      setLastExport(d);
      toast({ title: "Export berhasil", description: `${d.total} order diekspor ke Google Sheets.` });
    },
    onError: (e) => toast({ title: "Export gagal", description: (e as Error).message, variant: "destructive" }),
  });

  const spreadsheetId = config?.spreadsheetId;
  const sheetsUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-7 h-7 text-green-600" />
          <div>
            <Link href="/accounting">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <h1 className="text-xl font-bold text-slate-800">Google Sheets</h1>
            <p className="text-sm text-slate-500">Sinkronisasi akuntansi & export data order ke Google Sheets</p>
          </div>
        </div>

        {/* ── Export Logistic Orders ── */}
        <Card className="border-indigo-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-indigo-600" />
              Export Logistic Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Ekspor data order logistik ke spreadsheet Google Sheets baru. File otomatis dibuat dan bisa dibuka via link.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Dari Tanggal
                </label>
                <Input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Sampai Tanggal
                </label>
                <Input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Filter Status</label>
              <select
                value={exportStatus}
                onChange={(e) => setExportStatus(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={() => exportOrdersMut.mutate()}
              disabled={exportOrdersMut.isPending}
            >
              {exportOrdersMut.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengekspor...</>
                : <><Upload className="w-4 h-4 mr-2" />Export ke Google Sheets</>}
            </Button>
            {lastExport && (
              <div className="flex items-center justify-between gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-indigo-800">{lastExport.total} order berhasil diekspor</p>
                    <p className="text-xs text-indigo-600 font-mono break-all">{lastExport.spreadsheetId}</p>
                  </div>
                </div>
                <a href={lastExport.spreadsheetUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1 shrink-0">
                    <ExternalLink className="w-3 h-3" /> Buka
                  </Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Akuntansi — Status Koneksi ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TableIcon className="w-4 h-4" /> Sinkronisasi Akuntansi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
              </div>
            ) : spreadsheetId ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Terhubung ke Google Sheets</p>
                    <p className="text-xs text-green-600 font-mono break-all">{spreadsheetId}</p>
                  </div>
                </div>
                <a href={sheetsUrl!} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1 shrink-0">
                    <ExternalLink className="w-3 h-3" /> Buka
                  </Button>
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Belum ada spreadsheet akuntansi yang terhubung.
              </div>
            )}

            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                {spreadsheetId ? "Ganti Spreadsheet" : "Hubungkan Spreadsheet"}
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Spreadsheet ID (kosongkan untuk buat baru)"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  className="text-sm"
                />
                <Button onClick={() => setupMut.mutate(customId || undefined)} disabled={setupMut.isPending} className="shrink-0">
                  {setupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
                  <span className="ml-1">{customId ? "Simpan" : "Buat Baru"}</span>
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                ID ada di URL: …/spreadsheets/d/<strong>ID_DI_SINI</strong>/edit
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tombol Sinkronisasi */}
        {spreadsheetId && (
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-blue-100">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" />
                  <p className="font-semibold text-slate-800">Push ke Sheets</p>
                </div>
                <p className="text-xs text-slate-500">
                  Kirim CoA, Jurnal, Lines, Trial Balance & GL ke Sheets. Data lama ditimpa.
                </p>
                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => pushMut.mutate()} disabled={pushMut.isPending}>
                  {pushMut.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</>
                    : <><Upload className="w-4 h-4 mr-2" />Push Sekarang</>}
                </Button>
                {lastPush && (
                  <div className="text-xs text-blue-700 bg-blue-50 rounded p-2 space-y-0.5">
                    <p>✅ {lastPush.pushed.accounts} akun</p>
                    <p>✅ {lastPush.pushed.entries} entri jurnal</p>
                    <p>✅ {lastPush.pushed.lines} baris entri</p>
                    <a href={`https://docs.google.com/spreadsheets/d/${lastPush.spreadsheetId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-1">
                      <ExternalLink className="w-3 h-3" /> Buka Sheets
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-emerald-100">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-emerald-600" />
                  <p className="font-semibold text-slate-800">Pull dari Sheets</p>
                </div>
                <p className="text-xs text-slate-500">
                  Baca perubahan dari Sheets. Akun baru ditambahkan, yang ada diperbarui. Entri baru dibuat sebagai draft.
                </p>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => pullMut.mutate()} disabled={pullMut.isPending}>
                  {pullMut.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Membaca...</>
                    : <><Download className="w-4 h-4 mr-2" />Pull Sekarang</>}
                </Button>
                {lastPull && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 rounded p-2 space-y-0.5">
                    <p>✅ {lastPull.coaAdded} akun baru</p>
                    <p>✅ {lastPull.coaUpdated} akun diperbarui</p>
                    <p>✅ {lastPull.entriesAdded} entri draft dibuat</p>
                    {lastPull.errors.length > 0 && (
                      <div className="mt-1 text-amber-700">
                        <p className="font-medium">⚠ {lastPull.errors.length} peringatan:</p>
                        {lastPull.errors.map((e, i) => <p key={i} className="pl-2">• {e}</p>)}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Panduan */}
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-slate-700 font-medium text-sm">
              <Info className="w-4 h-4" /> Cara Kerja
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-4">
              <li>📦 <strong>Export Orders:</strong> Membuat spreadsheet baru setiap dijalankan. Filter per tanggal & status tersedia.</li>
              <li>📤 <strong>Push Akuntansi:</strong> Data ditulis ke 5 tab: <em>CoA, Jurnal, Lines, TrialBalance, GL</em></li>
              <li>✏️ <strong>Edit di Sheets:</strong> Tambah baris baru tanpa ID di tab <em>CoA</em> atau <em>Jurnal</em> untuk data baru.</li>
              <li>📥 <strong>Pull Akuntansi:</strong> Baris dengan ID diperbarui, tanpa ID dianggap baru. Entri jurnal baru masuk sebagai <Badge variant="outline" className="text-xs py-0">draft</Badge>.</li>
              <li>🔑 <strong>Autentikasi:</strong> Semua operasi pakai Google Service Account dari konfigurasi server.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
