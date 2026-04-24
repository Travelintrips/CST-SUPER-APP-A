import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetProfitLoss, getGetProfitLossQueryKey } from "@workspace/api-client-react";
import { TrendingUp } from "lucide-react";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

export default function ProfitLossPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = useMemo(() => ({
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
  }), [from, to]);
  const { data, isLoading } = useGetProfitLoss(params, { query: { queryKey: getGetProfitLossQueryKey(params) } });

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6" />Laporan Laba Rugi</h1>
          <p className="text-sm text-muted-foreground">Pendapatan dikurangi beban dalam periode terpilih</p>
        </div>

        <Card><CardContent className="p-4 flex gap-4">
          <div className="flex-1"><Label>Dari</Label><DatePicker value={from} onChange={setFrom} data-testid="input-from" /></div>
          <div className="flex-1"><Label>Sampai</Label><DatePicker value={to} onChange={setTo} data-testid="input-to" /></div>
        </CardContent></Card>

        {isLoading ? <Card><CardContent className="p-4">Memuat...</CardContent></Card> : !data ? null : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="font-semibold mb-2 text-emerald-700">Pendapatan</div>
                <Table>
                  <TableBody>
                    {data.revenues.length === 0 ? (
                      <TableRow><TableCell className="text-muted-foreground text-center">Tidak ada</TableCell></TableRow>
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
                      <TableRow><TableCell className="text-muted-foreground text-center">Tidak ada</TableCell></TableRow>
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
                <div className={`text-2xl font-bold font-mono ${data.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`} data-testid="text-net-income">{idr(data.netIncome)}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
