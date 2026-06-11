import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle2, Download, RefreshCw,
  FileText, ShieldCheck, Info, XCircle,
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

// ── helpers ─────────────────────────────────────────────────────────────────

function generatePeriods() {
  const p: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    p.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return p;
}

const PERIODS = generatePeriods();

function periodLabel(p: string) {
  const [y, m] = p.split("-");
  const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${MONTHS[parseInt(m ?? "1") - 1]} ${y}`;
}

function fmtRp(n: number) {
  return "Rp " + Math.round(Math.abs(n)).toLocaleString("id-ID");
}

// ── types ────────────────────────────────────────────────────────────────────

interface EfakturSide { total: number; npwpMissing: number; fakturMissing: number; }
interface PphByType  { taxName: string; total: number; npwpMissing: number; bukpotMissing: number; }
interface ValidateResult {
  period: string;
  efaktur: {
    keluaran: EfakturSide;
    masukan: EfakturSide;
    npwpFormatInvalid: number;
    fakturFormatInvalid: number;
    readyToExport: boolean;
    issues: number;
  };
  ebupot: {
    total: number;
    byType: PphByType[];
    npwpMissing: number;
    bukpotMissing: number;
    bukpotFormatInvalid: number;
    readyToExport: boolean;
    issues: number;
  };
}

// ── sub-components ───────────────────────────────────────────────────────────

function IssueRow({ label, count, warn = false }: { label: string; count: number; warn?: boolean }) {
  if (count === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{label}</span>
        <Badge variant="outline" className="ml-auto border-emerald-300 text-emerald-700 text-[10px]">OK</Badge>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 text-sm ${warn ? "text-orange-700" : "text-red-700"}`}>
      {warn
        ? <AlertTriangle className="h-4 w-4 shrink-0" />
        : <XCircle className="h-4 w-4 shrink-0" />}
      <span>{label}</span>
      <Badge variant="outline" className={`ml-auto text-[10px] ${warn ? "border-orange-300 text-orange-700" : "border-red-300 text-red-700"}`}>
        {count} baris
      </Badge>
    </div>
  );
}

function ExportButton({
  label, href, disabled, loading,
}: { label: string; href: string; disabled?: boolean; loading?: boolean }) {
  return (
    <Button
      variant="default"
      size="sm"
      disabled={disabled || loading}
      className="gap-2"
      onClick={() => { if (!disabled) window.open(href, "_blank"); }}
    >
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function TaxExportDjpPage() {
  const { selectedCompanyId } = useCompany();
  const [period, setPeriod] = useState(PERIODS[0]!);
  const [tab, setTab] = useState<"efaktur" | "ebupot">("efaktur");

  const params = new URLSearchParams({ period });
  if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));

  const { data, isLoading, isFetching, refetch } = useQuery<ValidateResult>({
    queryKey: ["tax-export-validate", selectedCompanyId, period],
    queryFn: () =>
      fetch(`/api/tax/export/validate?${params}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!period,
  });

  function exportUrl(path: string, extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ period, ...extra });
    if (selectedCompanyId) p.set("companyId", String(selectedCompanyId));
    return `/api/tax/export/${path}?${p}`;
  }

  const ef = data?.efaktur;
  const eb = data?.ebupot;

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Export SPT Masa — DJP
            </h1>
            <p className="text-sm text-muted-foreground">
              Generate CSV siap upload ke e-Faktur dan e-Bupot (DJP Online)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue>{periodLabel(period)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 p-3.5 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Cara pakai:</span>{" "}
            Pilih periode masa pajak, periksa hasil validasi di bawah, lalu klik tombol Download.
            File e-Faktur (<code>.txt</code>) diimport ke aplikasi e-Faktur DJP.
            File e-Bupot (<code>.csv</code>) diupload ke djponline.pajak.go.id.
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="efaktur" className="gap-2">
              e-Faktur PPN
              {ef && ef.issues > 0 && (
                <Badge variant="destructive" className="text-[10px] ml-1">{ef.issues}</Badge>
              )}
              {ef && ef.issues === 0 && ef.keluaran.total + ef.masukan.total > 0 && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-1" />
              )}
            </TabsTrigger>
            <TabsTrigger value="ebupot" className="gap-2">
              e-Bupot PPh
              {eb && eb.issues > 0 && (
                <Badge variant="destructive" className="text-[10px] ml-1">{eb.issues}</Badge>
              )}
              {eb && eb.issues === 0 && eb.total > 0 && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-1" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── e-Faktur tab ── */}
          <TabsContent value="efaktur" className="space-y-4 mt-4">
            {isLoading ? (
              <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}</div>
            ) : !ef ? null : (
              <>
                {/* Status cards */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Keluaran */}
                  <Card className={ef.keluaran.total === 0 ? "border-muted" : ef.keluaran.npwpMissing + ef.keluaran.fakturMissing === 0 ? "border-emerald-200" : "border-orange-200"}>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                        Faktur Keluaran (Output)
                        <Badge variant="secondary" className="ml-auto">{ef.keluaran.total} faktur</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      <IssueRow label="NPWP pembeli" count={ef.keluaran.npwpMissing} />
                      <IssueRow label="Nomor faktur pajak" count={ef.keluaran.fakturMissing} />
                    </CardContent>
                  </Card>

                  {/* Masukan */}
                  <Card className={ef.masukan.total === 0 ? "border-muted" : ef.masukan.npwpMissing + ef.masukan.fakturMissing === 0 ? "border-emerald-200" : "border-orange-200"}>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        Faktur Masukan (Input)
                        <Badge variant="secondary" className="ml-auto">{ef.masukan.total} faktur</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      <IssueRow label="NPWP penjual" count={ef.masukan.npwpMissing} />
                      <IssueRow label="Nomor faktur pajak" count={ef.masukan.fakturMissing} />
                    </CardContent>
                  </Card>
                </div>

                {/* Format issues */}
                {(ef.npwpFormatInvalid > 0 || ef.fakturFormatInvalid > 0) && (
                  <Card className="border-red-200 bg-red-50/40">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-xs font-semibold text-red-700 mb-2">Format tidak valid (akan menyebabkan reject DJP):</p>
                      <IssueRow label="NPWP format salah (bukan 15 digit)" count={ef.npwpFormatInvalid} />
                      <IssueRow label="Nomor faktur format salah (bukan 16 digit)" count={ef.fakturFormatInvalid} />
                    </CardContent>
                  </Card>
                )}

                {/* Ready banner */}
                {ef.readyToExport && ef.keluaran.total + ef.masukan.total > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Data siap export — tidak ada masalah validasi untuk periode {periodLabel(period)}</span>
                  </div>
                ) : ef.keluaran.total + ef.masukan.total === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span>Tidak ada data PPN untuk periode {periodLabel(period)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{ef.issues} masalah ditemukan — disarankan perbaiki dulu sebelum export (atau download tetap bisa, DJP mungkin reject baris bermasalah)</span>
                  </div>
                )}

                {/* Download buttons */}
                <div className="flex flex-wrap gap-3 pt-1">
                  <ExportButton
                    label={`Unduh Keluaran (${ef.keluaran.total} faktur)`}
                    href={exportUrl("efaktur", { direction: "keluaran" })}
                    disabled={ef.keluaran.total === 0}
                    loading={isFetching}
                  />
                  <ExportButton
                    label={`Unduh Masukan (${ef.masukan.total} faktur)`}
                    href={exportUrl("efaktur", { direction: "masukan" })}
                    disabled={ef.masukan.total === 0}
                    loading={isFetching}
                  />
                  <ExportButton
                    label="Unduh Semua (Keluaran + Masukan)"
                    href={exportUrl("efaktur", { direction: "all" })}
                    disabled={ef.keluaran.total + ef.masukan.total === 0}
                    loading={isFetching}
                  />
                </div>

                {/* Format notes */}
                <div className="rounded-lg bg-muted/40 border p-3.5 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground/70">Catatan format e-Faktur:</p>
                  <p>• File berformat pipe-delimited (<code>|</code>) dengan baris <code>FK</code> (header) + <code>OF</code> (detail) per faktur</p>
                  <p>• Import ke aplikasi e-Faktur DJP: menu <em>Faktur → Import Faktur</em> (Keluaran) atau <em>Pajak Masukan → Upload CSV</em> (Masukan)</p>
                  <p>• Kolom NPWP wajib 15 digit, nomor faktur wajib 16 digit. Baris dengan placeholder <code>0000…</code> perlu dilengkapi manual sebelum upload</p>
                  <p>• Kode Jenis Transaksi default <code>01</code> (penyerahan ke non-pemungut) — sesuaikan jika ada transaksi ke bendahara atau dengan fasilitas</p>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── e-Bupot tab ── */}
          <TabsContent value="ebupot" className="space-y-4 mt-4">
            {isLoading ? (
              <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}</div>
            ) : !eb ? null : (
              <>
                {/* Summary per jenis PPh */}
                {eb.byType.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span>Tidak ada data PPh withholding untuk periode {periodLabel(period)}</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {eb.byType.map((t, i) => (
                      <Card key={i} className={t.npwpMissing + t.bukpotMissing === 0 ? "border-emerald-200" : "border-orange-200"}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold">{t.taxName}</span>
                            <Badge variant="secondary">{t.total} transaksi</Badge>
                          </div>
                          <div className="space-y-2">
                            <IssueRow label="NPWP yang dipotong" count={t.npwpMissing} />
                            <IssueRow label="Nomor bukti potong" count={t.bukpotMissing} warn />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Format issues */}
                {eb.bukpotFormatInvalid > 0 && (
                  <Card className="border-red-200 bg-red-50/40">
                    <CardContent className="p-4">
                      <IssueRow label="Format nomor bukti potong terlalu pendek (<8 karakter)" count={eb.bukpotFormatInvalid} />
                    </CardContent>
                  </Card>
                )}

                {/* Ready banner */}
                {eb.readyToExport && eb.total > 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Data siap export — tidak ada masalah untuk periode {periodLabel(period)}</span>
                  </div>
                ) : eb.total > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{eb.issues} masalah ditemukan — baris dengan NPWP kosong akan diisi placeholder <code>000000000000000</code>, nomor bukti potong akan digenerate otomatis</span>
                  </div>
                )}

                {/* Download buttons per jenis */}
                {eb.total > 0 && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {eb.byType.some((t) => t.taxName.toLowerCase().includes("pph 23") || t.taxName.toLowerCase().includes("pasal 23") || t.taxName.toLowerCase().includes("pph23")) && (
                      <ExportButton
                        label="Unduh e-Bupot PPh 23"
                        href={exportUrl("ebupot", { jenisPph: "pph23" })}
                        loading={isFetching}
                      />
                    )}
                    {eb.byType.some((t) => t.taxName.toLowerCase().includes("4") && (t.taxName.toLowerCase().includes("(2)") || t.taxName.toLowerCase().includes("final"))) && (
                      <ExportButton
                        label="Unduh e-Bupot PPh 4(2)"
                        href={exportUrl("ebupot", { jenisPph: "pph4a2" })}
                        loading={isFetching}
                      />
                    )}
                    {eb.byType.some((t) => t.taxName.toLowerCase().includes("pph 21") || t.taxName.toLowerCase().includes("pasal 21")) && (
                      <ExportButton
                        label="Unduh e-Bupot PPh 21"
                        href={exportUrl("ebupot", { jenisPph: "pph21" })}
                        loading={isFetching}
                      />
                    )}
                    {/* Fallback: tampilkan semua jika tidak ada match spesifik */}
                    {!eb.byType.some((t) =>
                      t.taxName.toLowerCase().includes("23") ||
                      t.taxName.toLowerCase().includes("4") ||
                      t.taxName.toLowerCase().includes("21")
                    ) && (
                      <ExportButton
                        label="Unduh e-Bupot PPh 23"
                        href={exportUrl("ebupot", { jenisPph: "pph23" })}
                        loading={isFetching}
                      />
                    )}
                  </div>
                )}

                {/* Format notes */}
                <div className="rounded-lg bg-muted/40 border p-3.5 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground/70">Catatan format e-Bupot:</p>
                  <p>• File berformat CSV UTF-8 BOM, sesuai format import DJP Online (djponline.pajak.go.id)</p>
                  <p>• Kolom <code>KODE_OBJEK_PAJAK</code> diderivasi otomatis dari nama pajak — verifikasi sebelum upload (misal <code>23-100-01</code> = jasa teknik)</p>
                  <p>• Jika nomor bukti potong kosong, sistem akan generate otomatis format <code>BP/YYYY/MM/NNNNNN</code></p>
                  <p>• Upload ke DJP Online: menu <em>Pelaporan → e-Bupot 23/26</em> atau <em>e-Bupot Unifikasi</em> tergantung jenis transaksi</p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Link ke halaman pelengkap data */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3.5 text-sm">
          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            Ada NPWP atau nomor faktur yang belum lengkap?{" "}
            <a href="/tax/missing-compliance" className="text-indigo-600 hover:underline font-medium">
              Lengkapi di halaman Missing Compliance →
            </a>
          </span>
        </div>

      </div>
    </AppShell>
  );
}
