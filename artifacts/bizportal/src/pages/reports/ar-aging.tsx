import { useGetArAging, getGetArAgingQueryKey } from "@workspace/api-client-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Receipt, ShoppingCart } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const bucketColor = (b: string) => {
  if (b === "0-30") return "bg-green-100 text-green-800";
  if (b === "31-60") return "bg-yellow-100 text-yellow-800";
  if (b === "61-90") return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
};

export default function ArAgingPage() {
  const { data, isLoading, error } = useGetArAging({ query: { queryKey: getGetArAgingQueryKey() } });

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Piutang (Accounts Receivable)
          </h1>
          <p className="text-sm text-muted-foreground">Daftar tagihan penjualan yang belum lunas — menampilkan sisa tagihan setelah pembayaran (tidak termasuk yang dibatalkan)</p>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="error-state">
            Gagal memuat: {String((error as any)?.message ?? error)}
          </div>
        ) : isLoading || !data ? (
          <div className="text-muted-foreground">Memuat...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <Card>
                <CardHeader><CardTitle className="text-sm text-muted-foreground">Total Piutang</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold" data-testid="stat-total-ar">{idr(data.total)}</div></CardContent>
              </Card>
              {(["0-30", "31-60", "61-90", "90+"] as const).map((b) => (
                <Card key={b}>
                  <CardHeader><CardTitle className="text-sm text-muted-foreground">{b} hari</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{idr(data.buckets[b])}</div></CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle>Detail Piutang</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No Dokumen</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Sejak</TableHead>
                      <TableHead className="text-right">Umur</TableHead>
                      <TableHead className="text-right">Total Tagihan</TableHead>
                      <TableHead className="text-right">Dibayar</TableHead>
                      <TableHead className="text-right">Sisa Tagihan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Tidak ada piutang</TableCell></TableRow>
                    ) : data.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>
                          <Link href={`/sales/orders/${it.id}`}>
                            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-mono">
                              <ShoppingCart size={10} />
                              {it.docNumber}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>{it.customerName ?? "-"}</TableCell>
                        <TableCell>{new Date(it.confirmedAt).toLocaleDateString("id-ID")}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={bucketColor(it.bucket)}>{it.daysOld} hari</Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{idr(it.grandTotal)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{idr(it.amountPaid)}</TableCell>
                        <TableCell className="text-right font-medium">{idr(it.amount)}</TableCell>
                      </TableRow>
                    ))}
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
