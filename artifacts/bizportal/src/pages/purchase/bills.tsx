import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useListPurchaseDocuments,
  useCreateAccountingPayment,
  useListJournals,
  getListPurchaseDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { CreditCard, FileText } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface PayDoc {
  id: number;
  docNumber: string;
  supplierName: string;
  grandTotal: number;
  amountPaid: number;
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-700 text-xs">Lunas</Badge>;
  if (status === "partial") return <Badge className="bg-amber-900/40 text-amber-300 border-amber-700 text-xs">Sebagian</Badge>;
  return <Badge variant="outline" className="text-xs text-slate-400">Belum Bayar</Badge>;
}

export default function PurchaseBillsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [filter, setFilter] = useState<"all" | "to_bill" | "billed">("all");
  const { data: docs } = useListPurchaseDocuments({ kind: "order" });
  const { data: journals = [] } = useListJournals();
  const bankCashJournals = journals.filter((j) => j.type === "bank" || j.type === "cash");

  const filtered = (docs ?? []).filter((d) => {
    if (filter === "all") return d.billStatus !== "none";
    return d.billStatus === filter;
  });

  const createMut = useCreateAccountingPayment();
  const [payDoc, setPayDoc] = useState<PayDoc | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [payForm, setPayForm] = useState({
    journalId: "",
    date: today,
    ref: "",
    memo: "",
    amount: "",
  });

  const openPayDialog = (doc: PayDoc) => {
    const balanceDue = Math.max(0, doc.grandTotal - doc.amountPaid);
    setPayDoc(doc);
    setPayForm({
      journalId: bankCashJournals.length > 0 ? String(bankCashJournals[0]!.id) : "",
      date: today,
      ref: doc.docNumber,
      memo: `Pembayaran tagihan ${doc.docNumber}`,
      amount: String(balanceDue),
    });
  };

  const closePayDialog = () => setPayDoc(null);

  const submitPayment = async () => {
    if (!payDoc || !payForm.journalId || !payForm.date || !payForm.amount) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    const amt = Number(payForm.amount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({
        data: {
          paymentType: "outbound",
          amount: amt,
          journalId: Number(payForm.journalId),
          partnerName: payDoc.supplierName,
          date: payForm.date,
          ref: payForm.ref || undefined,
          memo: payForm.memo || undefined,
          sourceType: "purchase_order",
          sourceDocId: payDoc.id,
        },
      });
      toast({ title: t.common.success });
      await qc.invalidateQueries({ queryKey: getListPurchaseDocumentsQueryKey() });
      closePayDialog();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(err);
      toast({ title: t.common.error, description: msg, variant: "destructive" });
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bills</h1>
            <p className="text-sm text-muted-foreground">Tagihan dari purchase orders.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")} data-testid="filter-all">Semua</Button>
            <Button size="sm" variant={filter === "to_bill" ? "default" : "outline"} onClick={() => setFilter("to_bill")} data-testid="filter-to-bill">Belum Ditagih</Button>
            <Button size="sm" variant={filter === "billed" ? "default" : "outline"} onClick={() => setFilter("billed")} data-testid="filter-billed">Sudah Ditagih</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Daftar Bill</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Order</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status Bill</TableHead>
                  <TableHead>Status Bayar</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sisa Hutang</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const balanceDue = Math.max(0, Number(d.grandTotal) - Number(d.amountPaid ?? 0));
                  const effectivePayStatus = balanceDue === 0 ? "paid" : (d.amountPaid ?? 0) > 0 ? "partial" : "unpaid";
                  const canPay = d.billStatus === "billed" && effectivePayStatus !== "paid";
                  return (
                    <TableRow key={d.id} data-testid={`row-bill-${d.id}`}>
                      <TableCell>
                        <Link href={`/purchase/orders/${d.id}`}>
                          <Badge className="bg-violet-900/40 text-violet-300 border-violet-700 text-xs gap-1 cursor-pointer hover:bg-violet-900/60 font-mono">
                            <FileText className="h-3 w-3" /> {d.docNumber}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell>{d.supplierName}</TableCell>
                      <TableCell>
                        <Badge variant={d.billStatus === "billed" ? "default" : "outline"} className="capitalize">
                          {d.billStatus.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {d.billStatus === "billed" ? (
                          <PaymentStatusBadge status={effectivePayStatus} />
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{idr(Number(d.grandTotal ?? d.totalAmount))}</TableCell>
                      <TableCell className="text-right">
                        {d.billStatus === "billed" && balanceDue > 0 ? (
                          <span className="text-amber-400 font-mono text-sm">{idr(balanceDue)}</span>
                        ) : d.billStatus === "billed" && balanceDue === 0 ? (
                          <span className="text-emerald-400 text-xs">Lunas</span>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("id-ID")}</TableCell>
                      <TableCell>
                        {canPay && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs"
                            data-testid={`pay-btn-${d.id}`}
                            onClick={() => openPayDialog({
                              id: d.id,
                              docNumber: d.docNumber,
                              supplierName: d.supplierName,
                              grandTotal: Number(d.grandTotal ?? d.totalAmount),
                              amountPaid: Number(d.amountPaid ?? 0),
                            })}
                          >
                            <CreditCard className="h-3 w-3" /> Bayar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Belum ada bill.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!payDoc} onOpenChange={(v) => { if (!v) closePayDialog(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Catat Pembayaran — {payDoc?.docNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="text-sm text-muted-foreground">
                Vendor: <span className="font-medium text-foreground">{payDoc?.supplierName}</span>
              </div>
              {payDoc && payDoc.amountPaid > 0 && (
                <div className="text-xs rounded bg-amber-900/20 border border-amber-700/30 p-2 text-amber-300">
                  Sudah dibayar: {idr(payDoc.amountPaid)} — Sisa hutang: {idr(Math.max(0, payDoc.grandTotal - payDoc.amountPaid))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tanggal</Label>
                  <Input
                    type="date"
                    value={payForm.date}
                    onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Jumlah (IDR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1000"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Jurnal (Bank / Kas)</Label>
                <Select
                  value={payForm.journalId}
                  onValueChange={(v) => setPayForm((f) => ({ ...f, journalId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jurnal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankCashJournals.map((j) => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        [{j.code}] {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>No. Referensi</Label>
                <Input
                  value={payForm.ref}
                  onChange={(e) => setPayForm((f) => ({ ...f, ref: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Memo</Label>
                <Textarea
                  rows={2}
                  value={payForm.memo}
                  onChange={(e) => setPayForm((f) => ({ ...f, memo: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closePayDialog}>Batal</Button>
              <Button onClick={submitPayment} disabled={createMut.isPending}>
                {createMut.isPending ? "Menyimpan..." : "Konfirmasi Pembayaran"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
