import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListSalesDocuments } from "@workspace/api-client-react";
import { Plus } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
  switch (s) {
    case "draft": return "secondary";
    case "sent": return "outline";
    case "confirmed": return "default";
    case "done": return "default";
    case "cancelled": return "destructive";
    default: return "secondary";
  }
};

interface Props {
  kind: "quote" | "order";
}

export default function SalesDocumentsListPage({ kind }: Props) {
  const { data: docs } = useListSalesDocuments({ kind });

  const isQuote = kind === "quote";
  const title = isQuote ? "Quotations" : "Sales Orders";
  const desc = isQuote ? "Penawaran ke pelanggan." : "Pesanan penjualan terkonfirmasi.";
  const detailBase = isQuote ? "/sales/quotations" : "/sales/orders";

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
          {isQuote && (
            <Link href="/sales/quotations/new">
              <Button data-testid="button-new-quote">
                <Plus className="mr-2 h-4 w-4" /> New Quotation
              </Button>
            </Link>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar {title}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  {!isQuote && <TableHead>Invoice</TableHead>}
                  {!isQuote && <TableHead>Delivery</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docs ?? []).map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" data-testid={`row-doc-${d.id}`}>
                    <TableCell className="font-medium">
                      <Link href={`${detailBase}/${d.id}`} className="hover:underline">{d.docNumber}</Link>
                    </TableCell>
                    <TableCell>{d.customerName}</TableCell>
                    <TableCell><Badge variant={statusVariant(d.status)} className="capitalize">{d.status}</Badge></TableCell>
                    {!isQuote && <TableCell><Badge variant="outline" className="capitalize">{d.invoiceStatus.replace("_", " ")}</Badge></TableCell>}
                    {!isQuote && <TableCell><Badge variant="outline" className="capitalize">{d.deliveryStatus.replace("_", " ")}</Badge></TableCell>}
                    <TableCell className="text-right font-medium">{idr(Number(d.totalAmount))}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("id-ID")}</TableCell>
                  </TableRow>
                ))}
                {(!docs || docs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={isQuote ? 5 : 7} className="text-center text-muted-foreground py-8">
                      Belum ada dokumen.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
