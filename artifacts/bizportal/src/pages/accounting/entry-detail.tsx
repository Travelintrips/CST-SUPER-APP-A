import { useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useGetAccountingEntry, useListAccounts, useListJournals,
  getGetAccountingEntryQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, ChevronLeft, FileText } from "lucide-react";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

export default function EntryDetailPage() {
  const [, params] = useRoute("/accounting/entries/:id");
  const id = parseInt(params?.id ?? "0");
  const { data: entry, isLoading } = useGetAccountingEntry(id, { query: { queryKey: getGetAccountingEntryQueryKey(id), enabled: !!id } });
  const { data: accounts } = useListAccounts();
  const { data: journals } = useListJournals();

  const accLabel = (aid: number) => {
    const a = accounts?.find((x) => x.id === aid);
    return a ? `${a.code} ${a.name}` : `#${aid}`;
  };
  const journalLabel = (jid: number) => {
    const j = journals?.find((x) => x.id === jid);
    return j ? `${j.code} - ${j.name}` : `#${jid}`;
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Link href="/accounting/entries"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Kembali</Button></Link>
          <Link href="/accounting/entries"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>

          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />{entry?.entryNumber ?? "Memuat..."}</h1>
        </div>

        {isLoading ? <div>Memuat...</div> : !entry ? <div>Entry tidak ditemukan</div> : (
          <>
            <Card>
              <CardHeader><CardTitle>Detail</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nomor:</span> <span className="font-mono">{entry.entryNumber}</span></div>
                <div><span className="text-muted-foreground">Tanggal:</span> {new Date(entry.date).toLocaleDateString("id-ID")}</div>
                <div><span className="text-muted-foreground">Jurnal:</span> {journalLabel(entry.journalId)}</div>
                <div><span className="text-muted-foreground">Sumber:</span> <Badge variant="secondary">{entry.source}</Badge></div>
                <div><span className="text-muted-foreground">Referensi:</span> {entry.ref ?? "-"}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge>{entry.status}</Badge></div>
                <div className="col-span-2"><span className="text-muted-foreground">Deskripsi:</span> {entry.description ?? "-"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Baris Jurnal</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Akun</TableHead><TableHead>Deskripsi</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {entry.lines.map((l) => (
                      <TableRow key={l.id} data-testid={`row-line-${l.id}`}>
                        <TableCell className="font-mono text-xs">{accLabel(l.accountId)}</TableCell>
                        <TableCell className="text-xs">{l.description ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">{l.debit > 0 ? idr(l.debit) : ""}</TableCell>
                        <TableCell className="text-right font-mono">{l.credit > 0 ? idr(l.credit) : ""}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right font-mono">{idr(entry.totalDebit)}</TableCell>
                      <TableCell className="text-right font-mono">{idr(entry.totalCredit)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
