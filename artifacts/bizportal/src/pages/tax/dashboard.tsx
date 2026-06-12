import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, AlertCircle, FileText,
  CheckCircle2, Users, Receipt, RefreshCw, ArrowRight,
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

function formatRp(n: number) {
  return "Rp " + Math.abs(Math.round(n)).toLocaleString("id-ID");
}

function generatePeriods() {
  const periods: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return periods;
}

const PERIODS = generatePeriods();

interface DashboardData {
  period: string;
  ppnKeluaran: number;
  ppnMasukan: number;
  ppnKurangBayar: number;
  pphRows: { taxName: string; total: number; count: number }[];
  pendingCount: number;
  noNpwpCount: number;
  noInvoiceCount: number;
}

function StatCard({
  title, value, sub, icon, colorClass, href, badge,
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode;
  colorClass: string; href?: string; badge?: string;
}) {
  const inner = (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl shrink-0 ${colorClass}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {badge && <Badge variant="secondary" className="shrink-0 text-xs">{badge}</Badge>}
        {href && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export default function TaxDashboardPage() {
  const { selectedCompanyId } = useCompany();
  const [period, setPeriod] = useState(PERIODS[0]);

  const { data, isLoading, isFetching, refetch } = useQuery<DashboardData>({
    queryKey: ["tax-dashboard", selectedCompanyId, period],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));
      const r = await fetch(`/api/tax/dashboard?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat data");
      return r.json();
    },
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-emerald-600" />
              Dashboard Pajak
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Ringkasan kewajiban pajak perusahaan</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><div className="h-20 bg-muted animate-pulse rounded-lg" /></CardContent></Card>
            ))}
          </div>
        ) : data ? (
          <>
            {/* PPN Section */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">PPN</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  title="PPN Keluaran"
                  value={formatRp(data.ppnKeluaran)}
                  sub="Pajak atas penjualan/jasa"
                  icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
                  colorClass="bg-blue-50"
                  href="/tax/ppn"
                />
                <StatCard
                  title="PPN Masukan"
                  value={formatRp(data.ppnMasukan)}
                  sub="Pajak atas pembelian"
                  icon={<TrendingDown className="h-5 w-5 text-violet-600" />}
                  colorClass="bg-violet-50"
                  href="/tax/ppn"
                />
                <Card className={`overflow-hidden ${data.ppnKurangBayar > 0 ? "border-orange-200 bg-orange-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
                  <CardContent className="p-5">
                    <p className="text-xs font-medium text-muted-foreground">PPN Kurang/Lebih Bayar</p>
                    <p className={`text-2xl font-bold tabular-nums mt-1 ${data.ppnKurangBayar > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                      {data.ppnKurangBayar >= 0 ? "" : "+"}{formatRp(Math.abs(data.ppnKurangBayar))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.ppnKurangBayar > 0 ? "Kurang bayar — perlu disetor" : data.ppnKurangBayar < 0 ? "Lebih bayar — bisa dikompensasi" : "Nihil"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* PPh Section */}
            {data.pphRows.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">PPh Witholding</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {data.pphRows.map((r) => (
                    <Card key={r.taxName}>
                      <CardContent className="p-4">
                        <p className="text-xs font-medium text-muted-foreground truncate">{r.taxName}</p>
                        <p className="text-xl font-bold tabular-nums">{formatRp(r.total)}</p>
                        <p className="text-xs text-muted-foreground">{r.count} transaksi</p>
                      </CardContent>
                    </Card>
                  ))}
                  <Link href="/tax/pph" className="block">
                    <Card className="h-full hover:shadow-sm transition-shadow cursor-pointer border-dashed">
                      <CardContent className="p-4 flex items-center gap-2 text-muted-foreground h-full">
                        <ArrowRight className="h-4 w-4" />
                        <span className="text-xs">Lihat detail PPh</span>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              </div>
            )}

            {/* Alerts */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Perhatian</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  title="Belum Direview"
                  value={String(data.pendingCount)}
                  sub="Transaksi pajak status pending"
                  icon={<AlertCircle className="h-5 w-5 text-orange-600" />}
                  colorClass={data.pendingCount > 0 ? "bg-orange-50" : "bg-muted"}
                  href="/tax/transactions"
                  badge={data.pendingCount > 0 ? "!" : undefined}
                />
                <StatCard
                  title="Tanpa NPWP"
                  value={String(data.noNpwpCount)}
                  sub="Transaksi belum ada NPWP partner"
                  icon={<Users className="h-5 w-5 text-yellow-600" />}
                  colorClass={data.noNpwpCount > 0 ? "bg-yellow-50" : "bg-muted"}
                  href="/tax/transactions"
                />
                <StatCard
                  title="Tanpa No. Faktur"
                  value={String(data.noInvoiceCount)}
                  sub="PPN tanpa nomor faktur pajak"
                  icon={<FileText className="h-5 w-5 text-red-600" />}
                  colorClass={data.noInvoiceCount > 0 ? "bg-red-50" : "bg-muted"}
                  href="/tax/ppn"
                />
              </div>
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/tax/transactions">Transaksi Pajak</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/tax/ppn">PPN Masukan / Keluaran</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/tax/pph">PPh Witholding</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/tax/spt">SPT Masa</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/tax/rules">Master Aturan Pajak</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const params = new URLSearchParams({ period });
                if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));
                window.open(`/api/tax/export?${params}`, "_blank");
              }}>
                Export CSV
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>Belum ada data pajak untuk periode ini</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
