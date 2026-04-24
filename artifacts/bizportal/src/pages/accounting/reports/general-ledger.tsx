import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetGeneralLedger, useListAccounts, getGetGeneralLedgerQueryKey } from "@workspace/api-client-react";
import { BookOpen } from "lucide-react";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

export default function GeneralLedgerPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountId, setAccountId] = useState<number | undefined>();
  const params = useMemo(() => ({
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
    ...(accountId ? { accountId } : {}),
  }), [from, to, accountId]);
  const { data, isLoading } = useGetGeneralLedger(params, { query: { queryKey: getGetGeneralLedgerQueryKey(params) } });
  const { data: accounts } = useListAccounts();

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" />Buku Besar (General Ledger)</h1>
          <p className="text-sm text-muted-foreground">Mutasi & saldo per akun</p>
        </div>

        <Card><CardContent className="p-4 grid grid-cols-3 gap-3">
          <div>
            <Label>Akun</Label>
            <Select value={accountId ? String(accountId) : "all"} onValueChange={(v) => setAccountId(v === "all" ? undefined : parseInt(v))}>
              <SelectTrigger data-testid="select-gl-account"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Akun</SelectItem>
                {(accounts ?? []).map((a) => (<SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" /></div>
          <div><Label>Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" /></div>
        </CardContent></Card>

        {isLoading ? <Card><CardContent className="p-4">Memuat...</CardContent></Card> : !data || data.accounts.length === 0 ? <Card><CardContent className="p-4 text-center text-muted-foreground">Tidak ada data</CardContent></Card> : data.accounts.map((acc) => (
          <Card key={acc.accountId}>
            <CardContent className="p-4">
              <div className="font-semibold mb-2">{acc.code} - {acc.name} <span className="text-xs text-muted-foreground uppercase">({acc.type})</span></div>
              <Table>
                <TableHeader><TableRow><TableHead className="w-28">Tanggal</TableHead><TableHead className="w-32">Nomor</TableHead><TableHead>Ref</TableHead><TableHead>Deskripsi</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {acc.rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Tidak ada mutasi</TableCell></TableRow>
                  ) : acc.rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(r.date).toLocaleDateString("id-ID")}</TableCell>
                      <TableCell className="font-mono text-xs">{r.entryNumber}</TableCell>
                      <TableCell className="text-xs">{r.ref ?? "-"}</TableCell>
                      <TableCell className="text-xs">{r.description ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono">{r.debit > 0 ? idr(r.debit) : ""}</TableCell>
                      <TableCell className="text-right font-mono">{r.credit > 0 ? idr(r.credit) : ""}</TableCell>
                      <TableCell className="text-right font-mono">{idr(r.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold border-t bg-muted/30">
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right font-mono">{idr(acc.totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{idr(acc.totalCredit)}</TableCell>
                    <TableCell className="text-right font-mono">{idr(acc.endingBalance)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
