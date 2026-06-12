import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, CheckCircle2, Clock, FileText, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";

function formatRp(n: number) { return "Rp " + Math.abs(Math.round(n)).toLocaleString("id-ID"); }

function generateYears() {
  const now = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => String(now - i));
}

interface SptRow {
  period: string;
  tax_name: string;
  direction: string;
  cnt: number;
  total_base: string;
  total_tax: string;
  paid: string;
  reported: string;
  pending: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function monthLabel(period: string) {
  const parts = period.split("-");
  const m = parseInt(parts[1] ?? "1") - 1;
  return MONTH_NAMES[m] ?? period;
}

function StatusBar({ paid, reported, pending, total }: { paid: number; reported: number; pending: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">-</span>;
  const paidPct = Math.round((paid / total) * 100);
  const repPct = Math.round((reported / total) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 rounded-full overflow-hidden bg-muted flex">
        <div className="bg-emerald-500 h-full" style={{ width: `${paidPct}%` }} />
        <div className="bg-blue-400 h-full" style={{ width: `${repPct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{paidPct + repPct}% done</span>
    </div>
  );
}

export default function TaxSptPage() {
  const { selectedCompanyId } = useCompany();
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const params = new URLSearchParams({ year });
  if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));

  const { data, isLoading, isFetching, refetch } = useQuery<{ year: string; data: SptRow[] }>({
    queryKey: ["tax-spt", selectedCompanyId, year],
    queryFn: () => fetch(`/api/tax/spt?${params}`, { credentials: "include" }).then((r) => r.json()),
  });

  const rows = data?.data ?? [];

  // Group by month
  const byMonth: Record<string, SptRow[]> = {};
  for (const r of rows) {
    if (!byMonth[r.period]) byMonth[r.period] = [];
    byMonth[r.period].push(r);
  }
  const months = Object.keys(byMonth).sort();

  const grandTotalTax = rows.reduce((s, r) => s + Number(r.total_tax), 0);
  const grandPaid = rows.reduce((s, r) => s + Number(r.paid), 0);
  const grandPending = rows.reduce((s, r) => s + Number(r.pending), 0);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              SPT Masa Pajak
            </h1>
            <p className="text-sm text-muted-foreground">Rekap kewajiban pajak bulanan tahun {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{generateYears().map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Link href="/tax/export-djp">
              <Button variant="default" size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
                <FileSpreadsheet className="h-4 w-4" />Export DJP
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/tax/export?period_from=${year}-01&period_to=${year}-12${selectedCompanyId ? `&companyId=${selectedCompanyId}` : ""}`, "_blank")}>
              <Download className="h-4 w-4 mr-1.5" />Export Tahun
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Year summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Pajak {year}</p>
              <p className="text-2xl font-bold">{formatRp(grandTotalTax)}</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/60 border-emerald-200">
            <CardContent className="p-4">
              <p className="text-xs text-emerald-700">Sudah Disetor/Dilaporkan</p>
              <p className="text-2xl font-bold text-emerald-800">{formatRp(grandPaid)}</p>
            </CardContent>
          </Card>
          <Card className={grandPending > 0 ? "bg-orange-50/60 border-orange-200" : ""}>
            <CardContent className="p-4">
              <p className={`text-xs ${grandPending > 0 ? "text-orange-700" : "text-muted-foreground"}`}>Belum Disetor</p>
              <p className={`text-2xl font-bold ${grandPending > 0 ? "text-orange-800" : ""}`}>{formatRp(grandPending)}</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : months.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>Tidak ada data pajak untuk tahun {year}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {months.map((month) => {
              const mRows = byMonth[month];
              const mTotal = mRows.reduce((s, r) => s + Number(r.total_tax), 0);
              const mPaid = mRows.reduce((s, r) => s + Number(r.paid), 0);
              const mReported = mRows.reduce((s, r) => s + Number(r.reported), 0);
              const mPending = mRows.reduce((s, r) => s + Number(r.pending), 0);
              const allDone = mPending <= 0;
              return (
                <Card key={month} className={allDone ? "border-emerald-200" : ""}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-5 py-3 border-b">
                      <div className="flex items-center gap-2">
                        {allDone
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <Clock className="h-4 w-4 text-orange-400" />}
                        <span className="font-semibold">{monthLabel(month)} {month.slice(0, 4)}</span>
                        <span className="text-xs text-muted-foreground">({mRows.length} jenis pajak)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBar paid={mPaid} reported={mReported} pending={mPending} total={mTotal} />
                        <span className="font-bold text-sm">{formatRp(mTotal)}</span>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                          const p = new URLSearchParams({ period: month });
                          if (selectedCompanyId) p.set("companyId", String(selectedCompanyId));
                          window.open(`/api/tax/export?${p}`, "_blank");
                        }}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {mRows.map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-5 py-2 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-xs w-36 truncate">{r.tax_name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{r.direction}</span>
                            <span className="text-xs text-muted-foreground">{r.cnt} tx</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-muted-foreground">DPP: {formatRp(Number(r.total_base))}</span>
                            <span className="font-semibold">{formatRp(Number(r.total_tax))}</span>
                            {Number(r.pending) > 0 && (
                              <span className="text-orange-600 font-medium">Pending: {formatRp(Number(r.pending))}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
