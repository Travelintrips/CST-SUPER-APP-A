import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Landmark, BookOpen, FileText, Wallet, GitMerge, FileSpreadsheet,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, ArrowRight,
  RefreshCw, Sheet, ArrowLeftRight, Receipt, BarChart2,
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

interface RekonInfo {
  config: { lastRunDate?: string; enabled?: boolean; spreadsheetId?: string } | null;
  lastManualRekonAt: string | null;
}
interface GSheetConfig { spreadsheetId: string | null }
interface TrialRow { accountId: number; code: string; name: string; type: string; debit: number; credit: number; balance: number }
interface EntryRow { id: number; status: string }

async function apiFetch<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("fetch failed");
  return r.json();
}

function StatCard({ title, value, sub, icon: Icon, color = "blue", href }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; href?: string;
}) {
  const colors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    amber: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
    purple: "text-purple-600 bg-purple-50",
    slate: "text-slate-600 bg-slate-100",
  };
  const inner = (
    <CardContent className="p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
        <p className="text-xl font-bold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
    </CardContent>
  );
  if (href) return <Card className="hover:shadow-md transition-shadow cursor-pointer"><Link href={href}>{inner}</Link></Card>;
  return <Card>{inner}</Card>;
}

function QuickLink({ href, icon: Icon, label, desc }: { href: string; icon: React.ElementType; label: string; desc: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer group">
        <div className="p-1.5 rounded-md bg-slate-100 group-hover:bg-blue-100 transition-colors">
          <Icon className="h-4 w-4 text-slate-600 group-hover:text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{desc}</p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

export default function AccountingDashboardPage() {
  const { activeCompanyId } = useCompany();
  const companyId = activeCompanyId ?? 1;

  const [rekon, setRekon] = useState<RekonInfo | null>(null);
  const [gsheet, setGsheet] = useState<GSheetConfig | null>(null);
  const [trialRows, setTrialRows] = useState<TrialRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshed, setRefreshed] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<RekonInfo>("/api/accounting/rekon-schedule").catch(() => null),
      apiFetch<GSheetConfig>("/api/accounting/gsheet/config").catch(() => null),
      apiFetch<{ rows: TrialRow[] }>(`/api/accounting/reports/trial-balance?company=${companyId}`).catch(() => null),
      apiFetch<EntryRow[]>(`/api/accounting/entries?company=${companyId}`).catch(() => []),
    ]).then(([r, g, tb, e]) => {
      if (r) setRekon(r);
      if (g) setGsheet(g);
      if (tb) setTrialRows(tb.rows ?? []);
      if (e) setEntries(e as EntryRow[]);
      setLoading(false);
    });
  }, [companyId, refreshed]);

  // Rekon status
  const manualTs = rekon?.lastManualRekonAt ? new Date(rekon.lastManualRekonAt).getTime() : 0;
  const autoTs = rekon?.config?.lastRunDate ? new Date(rekon.config.lastRunDate).getTime() : 0;
  const latestTs = Math.max(manualTs, autoTs);
  const latestDays = latestTs > 0 ? Math.floor((Date.now() - latestTs) / 86400000) : null;
  const rekonOverdue = latestDays === null || latestDays >= 7;
  const rekonWarn = !rekonOverdue && latestDays >= 3;
  const rekonOk = !rekonOverdue && !rekonWarn;

  // Kas/Bank accounts — asset type dengan nama mengandung kata bank/kas/cash
  const bankAccounts = trialRows.filter(
    (r) => r.type === "asset" && /kas|bank|cash/i.test(r.name)
  );
  const totalKasBank = bankAccounts.reduce((s, r) => s + r.balance, 0);

  // Entri status
  const draftEntries = entries.filter((e) => e.status === "draft");
  const postedEntries = entries.filter((e) => e.status === "posted");

  const fmtDaysAgo = (days: number | null) =>
    days === null ? "Belum pernah" : days === 0 ? "Hari ini" : `${days} hari lalu`;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-blue-600" /> Accounting Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">Ringkasan status keuangan & akuntansi</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshed((x) => x + 1)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Rekonsiliasi Alert */}
        <Card className={rekonOverdue ? "border-red-200 bg-red-50/50" : rekonWarn ? "border-amber-200 bg-amber-50/50" : "border-green-200 bg-green-50/40"}>
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              {rekonOk
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <AlertTriangle className={`h-5 w-5 ${rekonOverdue ? "text-red-500" : "text-amber-500"}`} />}
              <div>
                <p className={`font-semibold text-sm ${rekonOverdue ? "text-red-800" : rekonWarn ? "text-amber-800" : "text-green-800"}`}>
                  Rekonsiliasi Bank
                </p>
                <p className={`text-xs ${rekonOverdue ? "text-red-600" : rekonWarn ? "text-amber-600" : "text-green-600"}`}>
                  {latestDays === null
                    ? "Belum pernah direkonsiliasi — segera lakukan!"
                    : rekonOverdue
                    ? `Terakhir ${latestDays} hari lalu — sudah lewat batas 7 hari!`
                    : rekonWarn
                    ? `Terakhir ${latestDays} hari lalu — segera lakukan sebelum 7 hari.`
                    : `Terkini — terakhir ${latestDays === 0 ? "hari ini" : `${latestDays} hari lalu`}.`}
                </p>
              </div>
            </div>
            <div className="flex gap-4 text-xs text-slate-500 ml-2">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Manual: <strong className="text-slate-700">{fmtDaysAgo(daysSince(rekon?.lastManualRekonAt ?? null))}</strong></span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Otomatis: <strong className="text-slate-700">{fmtDaysAgo(daysSince(rekon?.config?.lastRunDate ?? null))}</strong>
                <Badge variant="outline" className={`text-xs py-0 h-4 ${rekon?.config?.enabled ? "border-green-300 text-green-700" : "border-slate-300 text-slate-500"}`}>
                  {rekon?.config?.enabled ? "Aktif" : "Nonaktif"}
                </Badge>
              </span>
            </div>
            <Link href="/accounting/reconciliation" className="ml-auto">
              <Button size="sm" variant={rekonOverdue ? "destructive" : "outline"} className="gap-1">
                <GitMerge className="h-3.5 w-3.5" />
                {rekonOverdue ? "Rekonsiliasi Sekarang" : "Buka Rekonsiliasi"}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Kas & Bank"
            value={`Rp ${idr(totalKasBank)}`}
            sub={`${bankAccounts.length} akun`}
            icon={Wallet}
            color="green"
          />
          <StatCard
            title="Entri Draft"
            value={draftEntries.length}
            sub="belum diposting"
            icon={FileText}
            color={draftEntries.length > 0 ? "amber" : "slate"}
            href="/accounting/entries"
          />
          <StatCard
            title="Entri Terposting"
            value={postedEntries.length}
            sub="dalam periode ini"
            icon={CheckCircle2}
            color="blue"
            href="/accounting/entries"
          />
          <StatCard
            title="Google Sheets"
            value={gsheet?.spreadsheetId ? "Terhubung" : "Belum"}
            sub={gsheet?.spreadsheetId ? gsheet.spreadsheetId.slice(0, 20) + "…" : "Setup diperlukan"}
            icon={Sheet}
            color={gsheet?.spreadsheetId ? "green" : "red"}
            href="/accounting/gsheet"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Saldo Kas & Bank */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-green-600" /> Saldo Kas & Bank
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bankAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {loading ? "Memuat..." : "Tidak ada akun Kas/Bank ditemukan"}
                </p>
              ) : (
                <div className="divide-y">
                  {bankAccounts.map((a) => (
                    <div key={a.accountId} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{a.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{a.code}</p>
                      </div>
                      <span className={`text-sm font-bold font-mono ${a.balance >= 0 ? "text-green-700" : "text-red-600"}`}>
                        Rp {idr(a.balance)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                    <span className="text-sm font-semibold text-slate-700">Total</span>
                    <span className={`text-sm font-bold font-mono ${totalKasBank >= 0 ? "text-green-700" : "text-red-600"}`}>
                      Rp {idr(totalKasBank)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Menu Cepat</CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-0.5">
              <QuickLink href="/accounting/entries" icon={FileText} label="Jurnal Entry" desc="Buat atau lihat entri jurnal" />
              <QuickLink href="/accounting/entries?status=draft" icon={AlertTriangle} label={`${draftEntries.length} Entri Draft`} desc="Entri yang belum diposting" />
              <QuickLink href="/accounting/reconciliation" icon={GitMerge} label="Rekonsiliasi Bank" desc="Cocokkan mutasi bank vs BizPortal" />
              <QuickLink href="/accounting/gsheet" icon={FileSpreadsheet} label="Google Sheets Sync" desc="Push/Pull data akuntansi" />
              <QuickLink href="/accounting/reports/trial-balance" icon={BarChart2} label="Neraca Percobaan" desc="Trial balance semua akun" />
              <QuickLink href="/accounting/reports/profit-loss" icon={TrendingUp} label="Laba Rugi" desc="Laporan profit & loss" />
              <QuickLink href="/accounting/reports/balance-sheet" icon={Wallet} label="Neraca" desc="Balance sheet perusahaan" />
              <QuickLink href="/accounting/accounts" icon={Landmark} label="Bagan Akun (CoA)" desc="Kelola chart of accounts" />
              <QuickLink href="/accounting/payments" icon={ArrowLeftRight} label="Pembayaran" desc="Penerimaan & pembayaran" />
              <QuickLink href="/accounting/settings" icon={Receipt} label="Pengaturan Akuntansi" desc="Konfigurasi akun default" />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
