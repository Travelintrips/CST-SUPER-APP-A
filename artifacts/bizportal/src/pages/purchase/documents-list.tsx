import { useState } from "react";
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
import { useListPurchaseDocuments } from "@workspace/api-client-react";
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

type PaymentFilter = "all" | "unpaid" | "partial" | "paid";

const PAYMENT_LABELS: Record<PaymentFilter, string> = {
  all: "Semua",
  unpaid: "Belum Bayar",
  partial: "Sebagian",
  paid: "Lunas",
};

function PaymentBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-700">Lunas</Badge>;
  if (status === "partial") return <Badge className="bg-amber-900/50 text-amber-300 border-amber-700">Sebagian</Badge>;
  return <Badge variant="outline" className="text-slate-400 border-slate-600">Belum Bayar</Badge>;
}

interface Props {
  kind: "rfq" | "order";
}

export default function PurchaseDocumentsListPage({ kind }: Props) {
  const isRfq = kind === "rfq";
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  const { data: docs } = useListPurchaseDocuments({
    kind,
    ...(!isRfq && paymentFilter !== "all" ? { paymentStatus: paymentFilter } : {}),
  });

  const title = isRfq ? "Request for Quotation" : "Purchase Orders";
  const desc = isRfq ? "Permintaan penawaran ke vendor." : "Pesanan pembelian terkonfirmasi.";
  const detailBase = isRfq ? "/purchase/rfq" : "/purchase/orders";

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
          {isRfq && (
            <Link href="/purchase/rfq/new">
              <Button data-testid="button-new-rfq">
                <Plus className="mr-2 h-4 w-4" /> New RFQ
              </Button>
            </Link>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar {title}</CardTitle>
            {!isRfq && (
              <div className="flex flex-wrap gap-2 mt-2" data-testid="payment-status-filter">
                {(Object.keys(PAYMENT_LABELS) as PaymentFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPaymentFilter(f)}
                    data-testid={`filter-payment-${f}`}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                      paymentFilter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                    }`}
                  >
                    {PAYMENT_LABELS[f]}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  {!isRfq && <TableHead>Receive</TableHead>}
                  {!isRfq && <TableHead>Bill</TableHead>}
                  {!isRfq && <TableHead>Bayar</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(docs ?? []).map((d) => (
                  <TableRow key={d.id} data-testid={`row-doc-${d.id}`}>
                    <TableCell className="font-medium">
                      <Link href={`${detailBase}/${d.id}`} className="hover:underline">{d.docNumber}</Link>
                    </TableCell>
                    <TableCell>{d.supplierName}</TableCell>
                    <TableCell><Badge variant={statusVariant(d.status)} className="capitalize">{d.status}</Badge></TableCell>
                    {!isRfq && <TableCell><Badge variant="outline" className="capitalize">{d.receiveStatus.replace("_", " ")}</Badge></TableCell>}
                    {!isRfq && <TableCell><Badge variant="outline" className="capitalize">{d.billStatus.replace("_", " ")}</Badge></TableCell>}
                    {!isRfq && <TableCell><PaymentBadge status={d.paymentStatus} /></TableCell>}
                    <TableCell className="text-right font-medium">{idr(Number(d.totalAmount))}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("id-ID")}</TableCell>
                  </TableRow>
                ))}
                {(!docs || docs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={isRfq ? 5 : 8} className="text-center text-muted-foreground py-8">
                      {paymentFilter !== "all" ? `Tidak ada PO dengan status pembayaran "${PAYMENT_LABELS[paymentFilter]}".` : "Belum ada dokumen."}
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
