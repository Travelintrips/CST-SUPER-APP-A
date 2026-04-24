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
import { useState } from "react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function SalesInvoicesPage() {
  const [filter, setFilter] = useState<"all" | "to_invoice" | "invoiced">("all");
  const { data: docs } = useListSalesDocuments({ kind: "order" });

  const filtered = (docs ?? []).filter((d) => {
    if (filter === "all") return d.invoiceStatus !== "none";
    return d.invoiceStatus === filter;
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Invoices</h1>
            <p className="text-sm text-muted-foreground">Faktur dari sales orders.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")} data-testid="filter-all">Semua</Button>
            <Button size="sm" variant={filter === "to_invoice" ? "default" : "outline"} onClick={() => setFilter("to_invoice")} data-testid="filter-to-invoice">Belum Diinvoice</Button>
            <Button size="sm" variant={filter === "invoiced" ? "default" : "outline"} onClick={() => setFilter("invoiced")} data-testid="filter-invoiced">Sudah Diinvoice</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Daftar Invoice</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status Invoice</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id} data-testid={`row-invoice-${d.id}`}>
                    <TableCell className="font-medium">
                      <Link href={`/sales/orders/${d.id}`} className="hover:underline">{d.docNumber}</Link>
                    </TableCell>
                    <TableCell>{d.customerName}</TableCell>
                    <TableCell>
                      <Badge variant={d.invoiceStatus === "invoiced" ? "default" : "outline"} className="capitalize">
                        {d.invoiceStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{idr(Number(d.totalAmount))}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("id-ID")}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Belum ada invoice.
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
