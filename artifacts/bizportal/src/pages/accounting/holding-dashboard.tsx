import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  TrendingDown,
  Banknote,
  Receipt,
  CreditCard,
  Layers,
  RefreshCw,
  Download,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

interface HoldingSummary {
  revenue: number;
  expense: number;
  netPL: number;
  cashBalance: number;
  receivable: number;
  payable: number;
  companyIds: number[];
}

interface CompanyBreakdown {
  companyId: number;
  companyName: string;
  companyCode: string;
  revenue: number;
  expense: number;
  netPL: number;
  cashBalance: number;
  receivable: number;
  payable: number;
}

async function fetchSummary(from: string, to: string): Promise<HoldingSummary> {
  const params = new URLSearchParams({ holdingId: "1" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${BASE}/api/accounting/holding/summary?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Gagal memuat data summary");
  return res.json() as Promise<HoldingSummary>;
}

async function fetchBreakdown(from: string, to: string): Promise<CompanyBreakdown[]> {
  const params = new URLSearchParams({ holdingId: "1" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${BASE}/api/accounting/holding/breakdown?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Gagal memuat data breakdown");
  return res.json() as Promise<CompanyBreakdown[]>;
}

const COMPANY_COLORS: Record<string, string> = {
  CST: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  WS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  DV: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  ER: "bg-rose-500/10 text-rose-400 border-rose-500/30",
};

function getColorClass(code: string) {
  const prefix = code.slice(0, 2).toUpperCase();
  return COMPANY_COLORS[prefix] ?? COMPANY_COLORS["CST"]!;
}

export default function HoldingDashboardPage() {
  const currentYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${currentYear}-01-01`);
  const [to, setTo] = useState(`${currentYear}-12-31`);
  const [appliedFrom, setAppliedFrom] = useState(from);
  const [appliedTo, setAppliedTo] = useState(to);

  const { data: summary, isLoading: loadingS, refetch: refetchS } = useQuery({
    queryKey: ["holding-summary", appliedFrom, appliedTo],
    queryFn: () => fetchSummary(appliedFrom, appliedTo),
  });

  const { data: breakdown = [], isLoading: loadingB, refetch: refetchB } = useQuery({
    queryKey: ["holding-breakdown", appliedFrom, appliedTo],
    queryFn: () => fetchBreakdown(appliedFrom, appliedTo),
  });

  const isLoading = loadingS || loadingB;

  function applyFilter() {
    setAppliedFrom(from);
    setAppliedTo(to);
  }

  function refetch() {
    void refetchS();
    void refetchB();
  }

  function handleExportCSV() {
    const rows = [
      ["Perusahaan", "Revenue", "Expense", "Net P&L", "Kas & Bank", "Piutang", "Utang"],
      ...breakdown.map((b) => [
        b.companyName,
        b.revenue,
        b.expense,
        b.netPL,
        b.cashBalance,
        b.receivable,
        b.payable,
      ]),
      ["TOTAL KONSOLIDASI",
        summary?.revenue ?? 0,
        summary?.expense ?? 0,
        summary?.netPL ?? 0,
        summary?.cashBalance ?? 0,
        summary?.receivable ?? 0,
        summary?.payable ?? 0,
      ],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CST-Group-Holding-${appliedFrom}-sd-${appliedTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summaryCards = [
    {
      label: "Total Revenue",
      value: summary?.revenue,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Total Expense",
      value: summary?.expense,
      icon: TrendingDown,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
    },
    {
      label: "Net Profit / Loss",
      value: summary?.netPL,
      icon: Banknote,
      color: (summary?.netPL ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
      bg: (summary?.netPL ?? 0) >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
    },
    {
      label: "Total Kas & Bank",
      value: summary?.cashBalance,
      icon: Banknote,
      color: "text-sky-400",
      bg: "bg-sky-500/10",
    },
    {
      label: "Total Piutang",
      value: summary?.receivable,
      icon: Receipt,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Total Utang",
      value: summary?.payable,
      icon: CreditCard,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
    },
  ];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30">
              <Layers className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Holding Dashboard</h1>
                <Badge className="bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 text-xs font-mono">
                  CST GROUP — CONSOLIDATED VIEW
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm mt-0.5">
                Laporan keuangan konsolidasi seluruh entitas grup
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isLoading || breakdown.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Date Filter */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-sm w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-sm w-40"
            />
          </div>
          <Button size="sm" onClick={applyFilter} className="h-8">
            Terapkan Filter
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Periode: {appliedFrom} s/d {appliedTo}
          </span>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            const val = card.value;
            return (
              <Card key={card.label} className="border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    {isLoading ? (
                      <div className="h-5 w-32 rounded bg-muted animate-pulse mt-1" />
                    ) : (
                      <p className={`text-base font-bold ${card.color} truncate`}>
                        {val !== undefined ? fmt(val) : "—"}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Company Breakdown Table */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Breakdown per Perusahaan</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Perusahaan</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Expense</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Net P&L</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Kas & Bank</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Piutang</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Utang</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 rounded bg-muted animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        Belum ada data jurnal yang diposting untuk periode ini
                      </td>
                    </tr>
                  ) : (
                    breakdown.map((b) => (
                      <tr key={b.companyId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-mono font-semibold border ${getColorClass(b.companyCode)}`}>
                              {b.companyCode}
                            </span>
                            <span className="font-medium truncate max-w-[160px]">{b.companyName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt(b.revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-rose-400">{fmt(b.expense)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${b.netPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmt(b.netPL)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sky-400">{fmt(b.cashBalance)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400">{fmt(b.receivable)}</td>
                        <td className="px-4 py-3 text-right font-mono text-orange-400">{fmt(b.payable)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isLoading && breakdown.length > 0 && summary && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                        Total Konsolidasi
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{fmt(summary.revenue)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">{fmt(summary.expense)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${summary.netPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {fmt(summary.netPL)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-sky-400">{fmt(summary.cashBalance)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">{fmt(summary.receivable)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-orange-400">{fmt(summary.payable)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Info footer */}
        <p className="text-xs text-muted-foreground text-center pb-2">
          Data hanya dari jurnal berstatus <span className="font-semibold">Diposting</span>. Data setiap perusahaan tetap tersimpan terpisah — Holding hanya membaca dan menjumlahkan.
        </p>
      </div>
    </AppShell>
  );
}
