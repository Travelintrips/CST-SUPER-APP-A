import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetTrialBalance, getGetTrialBalanceQueryKey } from "@workspace/api-client-react";
import { FileSpreadsheet } from "lucide-react";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

export default function TrialBalancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = useMemo(() => ({
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
  }), [from, to]);
  const { data, isLoading } = useGetTrialBalance(params, { query: { queryKey: getGetTrialBalanceQueryKey(params) } });

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6" />Neraca Saldo (Trial Balance)</h1>
          <p className="text-sm text-muted-foreground">Saldo seluruh akun pada periode terpilih</p>
        </div>

        <Card><CardContent className="p-4 flex gap-4">
          <div className="flex-1"><Label>Dari</Label><DatePicker value={from} onChange={setFrom} data-testid="input-from" /></div>
          <div className="flex-1"><Label>Sampai</Label><DatePicker value={to} onChange={setTo} data-testid="input-to" /></div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          {isLoading ? <div>Memuat...</div> : !data || data.rows.length === 0 ? <div className="text-center text-muted-foreground py-8">Tidak ada data</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama Akun</TableHead><TableHead>Tipe</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.accountId} data-testid={`row-tb-${r.accountId}`}>
                    <TableCell className="font-mono">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">{r.type}</TableCell>
                    <TableCell className="text-right font-mono">{r.debit > 0 ? idr(r.debit) : ""}</TableCell>
                    <TableCell className="text-right font-mono">{r.credit > 0 ? idr(r.credit) : ""}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{idr(r.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2 bg-muted/30">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right font-mono">{idr(data.totalDebit)}</TableCell>
                  <TableCell className="text-right font-mono">{idr(data.totalCredit)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </div>
    </AppShell>
  );
}
