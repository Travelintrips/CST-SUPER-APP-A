import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Landmark, TrendingUp, TrendingDown, AlertTriangle,
  ArrowRight, ChevronRight, Wallet, ReceiptText,
} from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

interface AccountingKPI {
  cashBalance: number;
  totalAr: number;
  totalAp: number;
  overdueInvoices: number;
  overdueArAmount: number;
  overdueBills: number;
  overdueApAmount: number;
  monthRevenue: number;
  monthExpense: number;
  monthNetPL: number;
}

export function AccountingWidget() {
  const { activeCompanyId } = useCompany();

  const { data, isLoading } = useQuery<AccountingKPI>({
    queryKey: ["accounting-dashboard-kpi", activeCompanyId],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      const r = await fetch(`/api/accounting/dashboard-kpi?${qs}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Gagal memuat data akuntansi");
      return r.json() as Promise<AccountingKPI>;
    },
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  const plPositive = (data?.monthNetPL ?? 0) >= 0;

  const kpis = [
    {
      label: "Kas & Bank",
      value: idr(data?.cashBalance ?? 0),
      icon: Wallet,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200/60 dark:border-emerald-800/40",
      href: "/accounting/journals",
    },
    {
      label: "Piutang (AR)",
      value: idr(data?.totalAr ?? 0),
      icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200/60 dark:border-blue-800/40",
      href: "/accounting/partner-balances",
      badge:
        (data?.overdueInvoices ?? 0) > 0
          ? { label: `${data!.overdueInvoices} jt tempo`, variant: "destructive" as const }
          : undefined,
    },
    {
      label: "Utang (AP)",
      value: idr(data?.totalAp ?? 0),
      icon: TrendingDown,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200/60 dark:border-amber-800/40",
      href: "/accounting/partner-balances",
      badge:
        (data?.overdueBills ?? 0) > 0
          ? { label: `${data!.overdueBills} jt tempo`, variant: "destructive" as const }
          : undefined,
    },
    {
      label: "Revenue Bulan Ini",
      value: idr(data?.monthRevenue ?? 0),
      icon: ReceiptText,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/30",
      border: "border-purple-200/60 dark:border-purple-800/40",
      href: "/accounting/reports/profit-loss",
    },
    {
      label: "Beban Bulan Ini",
      value: idr(data?.monthExpense ?? 0),
      icon: TrendingDown,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-200/60 dark:border-rose-800/40",
      href: "/accounting/reports/profit-loss",
    },
    {
      label: "Laba Bersih",
      value: idr(data?.monthNetPL ?? 0),
      icon: plPositive ? TrendingUp : TrendingDown,
      color: plPositive
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400",
      bg: plPositive
        ? "bg-emerald-50 dark:bg-emerald-950/30"
        : "bg-red-50 dark:bg-red-950/30",
      border: plPositive
        ? "border-emerald-200/60 dark:border-emerald-800/40"
        : "border-red-200/60 dark:border-red-800/40",
      href: "/accounting/reports/profit-loss",
    },
  ];

  const hasOverdue =
    (data?.overdueInvoices ?? 0) > 0 || (data?.overdueBills ?? 0) > 0;

  return (
    <Card className="lg:col-span-2 border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <Landmark className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-base">Akuntansi</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Posisi Keuangan & Bulan Berjalan</p>
            </div>
            {hasOverdue && (
              <Badge variant="destructive" className="ml-1 text-[10px] py-0 h-4 gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />
                Jatuh Tempo
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/accounting">
              Lihat Detail <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpis.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              >
                <div
                  className={`rounded-lg border p-3 transition-all hover:shadow-sm hover:scale-[1.02] ${m.bg} ${m.border}`}
                >
                  <div className="flex items-center gap-1 mb-1.5">
                    <m.icon className={`h-3.5 w-3.5 shrink-0 ${m.color}`} />
                    <span className="text-[10px] text-muted-foreground leading-tight truncate flex-1">
                      {m.label}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <p className={`text-sm font-bold truncate ${m.color}`}>{m.value}</p>
                  {m.badge && (
                    <Badge
                      variant={m.badge.variant}
                      className="mt-1 text-[9px] py-0 h-3.5 px-1"
                    >
                      {m.badge.label}
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Overdue detail row */}
        {!isLoading && hasOverdue && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">Perlu Perhatian</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {(data?.overdueInvoices ?? 0) > 0 && (
                <Link href="/accounting/partner-balances" className="flex items-center justify-between gap-2 hover:underline">
                  <span className="text-muted-foreground">
                    {data!.overdueInvoices} Invoice Jatuh Tempo
                  </span>
                  <span className="font-semibold text-destructive tabular-nums">
                    {idr(data!.overdueArAmount)}
                  </span>
                </Link>
              )}
              {(data?.overdueBills ?? 0) > 0 && (
                <Link href="/accounting/partner-balances" className="flex items-center justify-between gap-2 hover:underline">
                  <span className="text-muted-foreground">
                    {data!.overdueBills} Bill Jatuh Tempo
                  </span>
                  <span className="font-semibold text-destructive tabular-nums">
                    {idr(data!.overdueApAmount)}
                  </span>
                </Link>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
