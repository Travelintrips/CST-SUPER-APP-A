import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetProfitLoss, getGetProfitLossQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ArrowLeft, TrendingUp, Printer, Download, BarChart3, List } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";
import { Link } from "wouter";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const idrShort = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}rb`;
  return `${sign}${abs}`;
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

interface CostCenter { id: number; code: string; name: string; isActive: boolean; }

export default function ProfitLossPage() {
  const { activeCompanyId, isConsolidated } = useCompany();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [costCenterId, setCostCenterId] = useState<string>("all");
  const [view, setView] = useState<"summary" | "monthly">("summary");

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["accounting-cost-centers", activeCompanyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!isConsolidated && activeCompanyId) params.set("company", String(activeCompanyId));
      const res = await fetch(`/api/accounting/cost-centers?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const params = useMemo(() => ({
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
    company: (isConsolidated ? "all" : activeCompanyId) as unknown as number,
    ...(costCenterId !== "all" ? { cost_center_id: Number(costCenterId) as unknown as number } : {}),
  }), [from, to, activeCompanyId, isConsolidated, costCenterId]);

  const { data, isLoading } = useGetProfitLoss(params, { query: { queryKey: getGetProfitLossQueryKey(params) } });

  const monthlyQp = new URLSearchParams();
  if (from) monthlyQp.set("from", new Date(from).toISOString());
  if (to) monthlyQp.set("to", new Date(to + "T23:59:59").toISOString());
  if (!isConsolidated && activeCompanyId) monthlyQp.set("company", String(activeCompanyId));

  const { data: monthlyData, isLoading: isMonthlyLoading } = useQuery<{ months: { month: string; revenue: number; expense: number; netIncome: number }[] }>({
    queryKey: ["pl-monthly", from, to, activeCompanyId, isConsolidated],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/reports/profit-loss-monthly?${monthlyQp}`);
      if (!res.ok) return { months: [] };
      return res.json();
    },
  });

  const selectedCCName = costCenterId === "all"
    ? "Semua Cost Center"
    : costCenters?.find((c) => String(c.id) === costCenterId)?.name ?? costCenterId;

  function buildExportRows() {
    if (!data) return [];
    return [
      ["=== PENDAPATAN ===", "", ""],
      ...data.revenues.map((r) => [r.code, r.name, r.amount]),
      ["", "Total Pendapatan", data.totalRevenue],
      ["", "", ""],
      ["=== BEBAN ===", "", ""],
      ...data.expenses.map((r) => [r.code, r.name, r.amount]),
      ["", "Total Beban", data.totalExpense],
      ["", "", ""],
      ["", "LABA (RUGI) BERSIH", data.netIncome],
    ] as (string | number | null | undefined)[][];
  }

  function buildMonthlyExportRows() {
    return (monthlyData?.months ?? []).map((m) => [
      fmtMonth(m.month), m.revenue, m.expense, m.netIncome,
    ]);
  }

  const hasData = !!data;
  const hasMonthly = (monthlyData?.months ?? []).length > 0;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/accounting">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />Laporan Laba Rugi
            </h1>
            <p className="text-sm text-muted-foreground">
              Pendapatan dikurangi beban dalam periode terpilih
              {costCenterId !== "all" && <span className="ml-2 font-medium text-primary">· {selectedCCName}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {view === "summary" && (
              <>
                <Button variant="outline" size="sm" onClick={() => printWindow("Laporan Laba Rugi", ["Kode","Nama","Jumlah"], buildExportRows(), [2])} disabled={!hasData}>
                  <Printer className="h-4 w-4 mr-1.5" />Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportXlsx("Laba_Rugi", ["Kode","Nama","Jumlah"], buildExportRows())} disabled={!hasData}>
                  <Download className="h-4 w-4 mr-1.5" />XLSX
                </Button>
              </>
            )}
            {view === "monthly" && (
              <Button variant="outline" size="sm" onClick={() => exportXlsx("Laba_Rugi_Bulanan", ["Bulan","Pendapatan","Beban","Laba/Rugi"], buildMonthlyExportRows())} disabled={!hasMonthly}>
                <Download className="h-4 w-4 mr-1.5" />XLSX Bulanan
              </Button>
            )}
          </div>
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[140px]">
              <Label>Dari</Label>
              <DatePicker value={from} onChange={setFrom} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label>Sampai</Label>
              <DatePicker value={to} onChange={setTo} />
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label>Cost Center</Label>
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger><SelectValue placeholder="Semua Cost Center" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Cost Center</SelectItem>
                  {(costCenters ?? []).filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-1 min-w-fit">
              <Button
                variant={view === "summary" ? "default" : "outline"} size="sm"
                onClick={() => setView("summary")}
              >
                <List className="h-3.5 w-3.5 mr-1" />Ringkasan
              </Button>
              <Button
                variant={view === "monthly" ? "default" : "outline"} size="sm"
                onClick={() => setView("monthly")}
              >
                <BarChart3 className="h-3.5 w-3.5 mr-1" />Tren Bulanan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ───── VIEW: RINGKASAN ───── */}
        {view === "summary" && (
          isLoading ? (
            <Card><CardContent className="p-4 text-muted-foreground text-sm">Memuat...</CardContent></Card>
          ) : !data ? null : (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2 text-emerald-700">Pendapatan</div>
                  <Table>
                    <TableBody>
                      {data.revenues.length === 0 ? (
                        <TableRow><TableCell className="text-muted-foreground text-center" colSpan={3}>Tidak ada</TableCell></TableRow>
                      ) : data.revenues.map((r) => (
                        <TableRow key={r.accountId}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right font-mono">{idr(r.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t bg-muted/30">
                        <TableCell colSpan={2}>Total Pendapatan</TableCell>
                        <TableCell className="text-right font-mono">{idr(data.totalRevenue)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2 text-rose-700">Beban</div>
                  <Table>
                    <TableBody>
                      {data.expenses.length === 0 ? (
                        <TableRow><TableCell className="text-muted-foreground text-center" colSpan={3}>Tidak ada</TableCell></TableRow>
                      ) : data.expenses.map((r) => (
                        <TableRow key={r.accountId}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right font-mono">{idr(r.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t bg-muted/30">
                        <TableCell colSpan={2}>Total Beban</TableCell>
                        <TableCell className="text-right font-mono">{idr(data.totalExpense)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex justify-between items-center">
                  <div className="text-lg font-bold">Laba (Rugi) Bersih</div>
                  <div className={`text-2xl font-bold font-mono ${data.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`} data-testid="text-net-income">
                    {idr(data.netIncome)}
                  </div>
                </CardContent>
              </Card>
            </>
          )
        )}

        {/* ───── VIEW: TREN BULANAN ───── */}
        {view === "monthly" && (
          isMonthlyLoading ? (
            <Card><CardContent className="p-4 text-muted-foreground text-sm">Memuat data bulanan...</CardContent></Card>
          ) : !hasMonthly ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm py-8">
              Tidak ada data jurnal dalam periode ini.<br />Pilih rentang tanggal atau pastikan jurnal sudah ter-posting.
            </CardContent></Card>
          ) : (
            <>
              {/* Chart */}
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-4 text-sm">Grafik Laba Rugi per Bulan</div>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={monthlyData!.months} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={idrShort} tick={{ fontSize: 11 }} width={70} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          idr(value),
                          name === "revenue" ? "Pendapatan" : name === "expense" ? "Beban" : "Laba/Rugi",
                        ]}
                        labelFormatter={fmtMonth}
                      />
                      <Legend formatter={(v) => v === "revenue" ? "Pendapatan" : v === "expense" ? "Beban" : "Laba/Rugi Bersih"} />
                      <Bar dataKey="revenue" fill="#10b981" radius={[3,3,0,0]} />
                      <Bar dataKey="expense" fill="#f43f5e" radius={[3,3,0,0]} />
                      <Line dataKey="netIncome" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Monthly table */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bulan</TableHead>
                        <TableHead className="text-right text-emerald-700">Pendapatan</TableHead>
                        <TableHead className="text-right text-rose-700">Beban</TableHead>
                        <TableHead className="text-right">Laba / Rugi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyData!.months.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium">{fmtMonth(m.month)}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-700">{idr(m.revenue)}</TableCell>
                          <TableCell className="text-right font-mono text-rose-700">{idr(m.expense)}</TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${m.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {idr(m.netIncome)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals */}
                      {(() => {
                        const months = monthlyData!.months;
                        const totRev = months.reduce((s, m) => s + m.revenue, 0);
                        const totExp = months.reduce((s, m) => s + m.expense, 0);
                        const totNet = totRev - totExp;
                        return (
                          <TableRow className="font-bold border-t-2 bg-muted/40">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right font-mono text-emerald-700">{idr(totRev)}</TableCell>
                            <TableCell className="text-right font-mono text-rose-700">{idr(totExp)}</TableCell>
                            <TableCell className={`text-right font-mono ${totNet >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{idr(totNet)}</TableCell>
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )
        )}
      </div>
    </AppShell>
  );
}
