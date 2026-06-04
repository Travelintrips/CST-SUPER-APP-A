import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, Upload, Download, RefreshCw, ExternalLink, CheckCircle2,
  AlertCircle, Loader2, TableIcon, FileSpreadsheet, Info,
} from "lucide-react";
import { Link } from "wouter";

type Config = { spreadsheetId: string | null };
type PushResult = { ok: boolean; spreadsheetId: string; spreadsheetUrl: string; pushed: { accounts: number; entries: number; lines: number } };
type PullResult = { ok: boolean; coaAdded: number; coaUpdated: number; entriesAdded: number; errors: string[] };
type SetupResult = { ok: boolean; spreadsheetId: string; spreadsheetUrl: string | null };

async function apiFetch<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
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

  const spreadsheetId = config?.spreadsheetId;
  const sheetsUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-7 h-7 text-green-600" />
          <div>
            <Link href="/accounting"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>

            <h1 className="text-xl font-bold text-slate-800">Sinkronisasi Google Sheets</h1>
            <p className="text-sm text-slate-500">Push data akuntansi ke Sheets, pull perubahan kembali ke database</p>
          </div>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TableIcon className="w-4 h-4" /> Status Koneksi Spreadsheet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Memuat...</div>
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
                Belum ada spreadsheet yang terhubung.
              </div>
            )}

            {/* Setup: buat baru atau pakai ID existing */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                {spreadsheetId ? "Ganti Spreadsheet" : "Hubungkan Spreadsheet"}
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Spreadsheet ID (opsional — kosongkan untuk buat baru)"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  className="text-sm"
                />
                <Button
                  onClick={() => setupMut.mutate(customId || undefined)}
                  disabled={setupMut.isPending}
                  className="shrink-0"
                >
                  {setupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sheet className="w-4 h-4" />}
                  <span className="ml-1">{customId ? "Simpan" : "Buat Baru"}</span>
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                Spreadsheet ID bisa ditemukan di URL Google Sheets: …/spreadsheets/d/<strong>ID_DI_SINI</strong>/edit
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
                  Kirim Chart of Accounts, Journal Entries, Entry Lines, dan Trial Balance ke Google Sheets. Data lama di Sheets akan ditimpa.
                </p>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => pushMut.mutate()}
                  disabled={pushMut.isPending}
                >
                  {pushMut.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</>
                    : <><Upload className="w-4 h-4 mr-2" />Push Sekarang</>
                  }
                </Button>
                {lastPush && (
                  <div className="text-xs text-blue-700 bg-blue-50 rounded p-2 space-y-0.5">
                    <p>✅ {lastPush.pushed.accounts} akun</p>
                    <p>✅ {lastPush.pushed.entries} entri jurnal</p>
                    <p>✅ {lastPush.pushed.lines} baris entri</p>
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
                  Baca perubahan dari Google Sheets. Akun baru akan ditambahkan, akun dengan ID akan diperbarui. Entri baru dibuat sebagai draft.
                </p>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => pullMut.mutate()}
                  disabled={pullMut.isPending}
                >
                  {pullMut.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Membaca...</>
                    : <><Download className="w-4 h-4 mr-2" />Pull Sekarang</>
                  }
                </Button>
                {lastPull && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 rounded p-2 space-y-0.5">
                    <p>✅ {lastPull.coaAdded} akun baru ditambah</p>
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
              <Info className="w-4 h-4" /> Cara Kerja Sinkronisasi Dua Arah
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-4">
              <li>📤 <strong>Push:</strong> Data dari database ditulis ke 5 tab: <em>CoA</em>, <em>Jurnal</em>, <em>Lines</em>, <em>TrialBalance</em>, <em>GL</em> (General Ledger dengan saldo berjalan per akun)</li>
              <li>✏️ <strong>Edit di Sheets:</strong> Ubah akun yang ada di tab <em>CoA</em> (kolom Kode, Nama, Tipe) atau tambah baris baru tanpa mengisi kolom ID. Untuk entri jurnal baru, tambah baris di tab <em>Jurnal</em> tanpa ID dengan Tanggal dan Jurnal ID.</li>
              <li>📥 <strong>Pull:</strong> BizPortal membaca Sheets. Baris dengan ID yang cocok akan diperbarui. Baris tanpa ID dianggap data baru.</li>
              <li>⚠️ <strong>Catatan:</strong> Entri jurnal baru dari Sheets dibuat sebagai <Badge variant="outline" className="text-xs py-0">draft</Badge> — perlu ditambah lines di halaman Jurnal sebelum diposting.</li>
              <li>🔒 <strong>Keamanan:</strong> Trial Balance di Sheets bersifat read-only (pull tidak membaca tab ini).</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
