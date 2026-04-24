import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useGetPurchaseDocument,
  useCreatePurchaseDocument,
  useUpdatePurchaseDocument,
  usePurchaseDocumentAction,
  useDeletePurchaseDocument,
  useListSuppliers,
  useListProducts,
  useListTaxes,
  useGetAccountingSettings,
  useListAccountingPayments,
  useCreateAccountingPayment,
  useListJournals,
  getGetPurchaseDocumentQueryKey,
  getListPurchaseDocumentsQueryKey,
  getListAccountingPaymentsQueryKey,
} from "@workspace/api-client-react";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Send, Check, X, FileText, Truck, Trash2, FileEdit, Save, Printer, CreditCard, Wallet } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface LineDraft {
  productId?: number | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitCost: number;
}

export default function PurchaseDocumentEditorPage() {
  const [, paramsNew] = useRoute("/purchase/rfq/new");
  const [, paramsRfq] = useRoute("/purchase/rfq/:id");
  const [, paramsOrder] = useRoute("/purchase/orders/:id");
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const isNew = !!paramsNew;
  const idStr = paramsRfq?.id ?? paramsOrder?.id;
  const id = idStr ? Number(idStr) : null;

  const { data: doc, isLoading: docLoading } = useGetPurchaseDocument(id ?? 0, {
    query: {
      enabled: !isNew && id !== null,
      queryKey: getGetPurchaseDocumentQueryKey(id ?? 0),
    },
  });
  const { data: vendors } = useListSuppliers();
  const { data: products } = useListProducts();
  const { data: taxes } = useListTaxes();
  const { data: acctSettings } = useGetAccountingSettings();
  const createMut = useCreatePurchaseDocument();
  const updateMut = useUpdatePurchaseDocument();
  const actionMut = usePurchaseDocumentAction();
  const deleteMut = useDeletePurchaseDocument();
  const createPaymentMut = useCreateAccountingPayment();
  const { data: journals = [] } = useListJournals();
  const bankCashJournals = journals.filter((j) => j.type === "bank" || j.type === "cash");

  const paymentQueryParams = { sourceType: "purchase_order", sourceDocId: id ?? 0 };
  const { data: linkedPayments = [], isLoading: paymentsLoading } = useListAccountingPayments(
    paymentQueryParams,
    {
      query: {
        enabled: !!paramsOrder && id !== null,
        queryKey: getListAccountingPaymentsQueryKey(paymentQueryParams),
      },
    },
  );

  const today = new Date().toISOString().slice(0, 10);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payForm, setPayForm] = useState({ journalId: "", date: today, ref: "", memo: "", amount: "" });

  const openPayDialog = () => {
    if (!doc || !id) return;
    const balanceDue = Math.max(0, Number(doc.grandTotal ?? 0) - Number(doc.amountPaid ?? 0));
    setPayForm({
      journalId: bankCashJournals.length > 0 ? String(bankCashJournals[0]!.id) : "",
      date: today,
      ref: doc.docNumber ?? "",
      memo: `Pembayaran bill ${doc.docNumber ?? ""}`,
      amount: String(balanceDue > 0 ? balanceDue : (doc.grandTotal ?? 0)),
    });
    setPayDialogOpen(true);
  };

  const submitPayment = async () => {
    if (!doc || !id || !payForm.journalId || !payForm.date || !payForm.amount) {
      toast({ title: "Jurnal, tanggal & jumlah wajib diisi", variant: "destructive" });
      return;
    }
    const amt = Number(payForm.amount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast({ title: "Jumlah harus angka positif", variant: "destructive" });
      return;
    }
    try {
      await createPaymentMut.mutateAsync({
        data: {
          paymentType: "outbound",
          amount: amt,
          journalId: Number(payForm.journalId),
          partnerName: doc.supplierName,
          date: payForm.date,
          ref: payForm.ref || undefined,
          memo: payForm.memo || undefined,
          sourceType: "purchase_order",
          sourceDocId: id,
        },
      });
      toast({ title: "Pembayaran dicatat", description: `Pembayaran untuk ${doc.docNumber} berhasil.` });
      qc.invalidateQueries({ queryKey: getListAccountingPaymentsQueryKey({ sourceType: "purchase_order", sourceDocId: id }) });
      qc.invalidateQueries({ queryKey: getGetPurchaseDocumentQueryKey(id) });
      setPayDialogOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(err);
      toast({ title: "Gagal mencatat pembayaran", description: msg, variant: "destructive" });
    }
  };

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { name: "", quantity: 1, unitCost: 0 },
  ]);
  const [taxRateId, setTaxRateId] = useState<number | null>(null);
  const [taxApplied, setTaxApplied] = useState(false);

  useEffect(() => {
    if (doc) {
      setSupplierId(doc.supplierId ?? null);
      setSupplierName(doc.supplierName);
      setExpectedDate(doc.expectedDate ? doc.expectedDate.slice(0, 10) : "");
      setNotes(doc.notes ?? "");
      setTaxRateId(doc.taxRateId ?? null);
      setTaxApplied(true);
      setLines(
        doc.lines.length > 0
          ? doc.lines.map((l) => ({
              productId: l.productId ?? null,
              name: l.name,
              description: l.description ?? null,
              quantity: Number(l.quantity),
              unitCost: Number(l.unitCost),
            }))
          : [{ name: "", quantity: 1, unitCost: 0 }],
      );
    }
  }, [doc]);

  useEffect(() => {
    if (isNew && !taxApplied && acctSettings?.defaultPurchaseTaxId) {
      setTaxRateId(acctSettings.defaultPurchaseTaxId);
      setTaxApplied(true);
    }
  }, [isNew, taxApplied, acctSettings]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitCost || 0), 0),
    [lines],
  );
  const selectedTax = useMemo(() => taxes?.find((t) => t.id === taxRateId) ?? null, [taxes, taxRateId]);
  const taxAmount = useMemo(() => selectedTax ? Math.round(subtotal * Number(selectedTax.rate)) / 100 : 0, [subtotal, selectedTax]);
  const grandTotal = subtotal + taxAmount;
  const total = subtotal;

  const isEditable = isNew || (doc && (doc.status === "draft" || doc.status === "sent"));

  const setLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((arr) => [...arr, { name: "", quantity: 1, unitCost: 0 }]);
  const removeLine = (idx: number) => setLines((arr) => arr.filter((_, i) => i !== idx));

  const onProductChange = (idx: number, productIdStr: string) => {
    if (productIdStr === "__custom") {
      setLine(idx, { productId: null });
      return;
    }
    const pid = Number(productIdStr);
    const product = (products ?? []).find((p) => p.id === pid);
    if (product) {
      setLine(idx, { productId: pid, name: product.name, unitCost: Number(product.price) });
    }
  };

  const onVendorChange = (val: string) => {
    if (val === "__none") {
      setSupplierId(null);
      return;
    }
    const sid = Number(val);
    setSupplierId(sid);
    const v = (vendors ?? []).find((x) => x.id === sid);
    if (v) setSupplierName(v.name);
  };

  const validate = (): string | null => {
    if (!supplierName.trim()) return "Vendor wajib diisi";
    if (lines.length === 0) return "Minimal satu baris item";
    for (const l of lines) {
      if (!l.name.trim()) return "Nama item pada setiap baris wajib diisi";
      if (Number(l.quantity) <= 0) return "Kuantitas harus > 0";
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    const body = {
      kind: "rfq" as const,
      supplierId,
      supplierName,
      taxRateId: taxRateId ?? null,
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : null,
      notes: notes || null,
      lines: lines.map((l) => ({
        productId: l.productId ?? null,
        name: l.name,
        description: l.description ?? null,
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost),
      })),
    };
    try {
      if (isNew) {
        const created = await createMut.mutateAsync({ data: body });
        qc.invalidateQueries({ queryKey: getListPurchaseDocumentsQueryKey() });
        toast({ title: "RFQ dibuat", description: created.docNumber });
        navigate(`/purchase/rfq/${created.id}`);
      } else if (id) {
        await updateMut.mutateAsync({ id, data: body });
        qc.invalidateQueries({ queryKey: getGetPurchaseDocumentQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListPurchaseDocumentsQueryKey() });
        toast({ title: "Dokumen diperbarui" });
      }
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    }
  };

  const runAction = async (action: "send" | "confirm" | "cancel" | "draft" | "mark_received" | "mark_billed") => {
    if (!id) return;
    try {
      const result = await actionMut.mutateAsync({ id, data: { action } });
      qc.invalidateQueries({ queryKey: getGetPurchaseDocumentQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListPurchaseDocumentsQueryKey() });
      toast({ title: `Status: ${result.status}` });
      if (action === "confirm") navigate(`/purchase/orders/${id}`);
    } catch (e) {
      toast({ title: "Aksi gagal", description: String(e), variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!id) return;
    if (!confirm("Hapus dokumen ini?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListPurchaseDocumentsQueryKey() });
      toast({ title: "Dihapus" });
      navigate("/purchase/rfq");
    } catch (e) {
      toast({ title: "Gagal menghapus", description: String(e), variant: "destructive" });
    }
  };

  const isOrderView = !!paramsOrder;
  const backHref = isOrderView ? "/purchase/orders" : "/purchase/rfq";

  if (!isNew && docLoading) {
    return <AppShell><div className="text-muted-foreground">Memuat...</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href={backHref}>
              <Button variant="ghost" size="icon" data-testid="button-back"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{isNew ? "RFQ Baru" : doc?.docNumber}</h1>
              {doc && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="capitalize">{doc.kind}</Badge>
                  <Badge variant="secondary" className="capitalize">{doc.status}</Badge>
                  {doc.kind === "order" && (
                    <>
                      <Badge variant="outline" className="capitalize">Receive: {doc.receiveStatus.replace("_", " ")}</Badge>
                      <Badge variant="outline" className="capitalize">Bill: {doc.billStatus.replace("_", " ")}</Badge>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isEditable && (
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save">
                <Save className="mr-2 h-4 w-4" /> Simpan
              </Button>
            )}
            {!isNew && doc?.status === "draft" && (
              <Button variant="outline" onClick={() => runAction("send")} data-testid="button-send"><Send className="mr-2 h-4 w-4" /> Kirim</Button>
            )}
            {!isNew && (doc?.status === "draft" || doc?.status === "sent") && (
              <Button variant="default" onClick={() => runAction("confirm")} data-testid="button-confirm"><Check className="mr-2 h-4 w-4" /> Konfirmasi</Button>
            )}
            {!isNew && doc?.kind === "order" && doc?.receiveStatus === "to_receive" && (
              <Button variant="outline" onClick={() => runAction("mark_received")} data-testid="button-receive"><Truck className="mr-2 h-4 w-4" /> Diterima</Button>
            )}
            {!isNew && doc?.kind === "order" && doc?.billStatus === "to_bill" && (
              <Button variant="outline" onClick={() => runAction("mark_billed")} data-testid="button-bill"><FileText className="mr-2 h-4 w-4" /> Billed</Button>
            )}
            {!isNew && doc?.status === "cancelled" && (
              <Button variant="outline" onClick={() => runAction("draft")} data-testid="button-redraft"><FileEdit className="mr-2 h-4 w-4" /> Set ke Draft</Button>
            )}
            {!isNew && doc && doc.status !== "cancelled" && doc.status !== "done" && (
              <Button variant="outline" onClick={() => runAction("cancel")} data-testid="button-cancel"><X className="mr-2 h-4 w-4" /> Batalkan</Button>
            )}
            {!isNew && doc?.status === "draft" && (
              <Button variant="ghost" onClick={remove} data-testid="button-delete"><Trash2 className="mr-2 h-4 w-4 text-destructive" /></Button>
            )}
            {!isNew && doc && id && (
              <Button variant="outline" onClick={() => window.open(`/api/purchase/documents/${id}/pdf`, "_blank")} data-testid="button-download-pdf">
                <Printer className="mr-2 h-4 w-4" /> Cetak PDF
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Informasi Vendor</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Vendor</Label>
              <Select value={supplierId !== null ? String(supplierId) : "__none"} onValueChange={onVendorChange} disabled={!isEditable}>
                <SelectTrigger data-testid="select-vendor"><SelectValue placeholder="Pilih vendor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Bebas (isi nama manual) —</SelectItem>
                  {(vendors ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Nama Vendor</Label>
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} disabled={!isEditable} data-testid="input-vendor-name" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tanggal Diharapkan</Label>
              <DatePicker value={expectedDate} onChange={setExpectedDate} disabled={!isEditable} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Catatan</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isEditable} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Item</CardTitle>
            {isEditable && (
              <Button size="sm" variant="outline" onClick={addLine} data-testid="button-add-line">
                <Plus className="mr-2 h-4 w-4" /> Tambah Baris
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Produk</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="w-[100px] text-right">Qty</TableHead>
                  <TableHead className="w-[150px] text-right">Harga Beli</TableHead>
                  <TableHead className="w-[150px] text-right">Subtotal</TableHead>
                  {isEditable && <TableHead className="w-[40px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, idx) => (
                  <TableRow key={idx} data-testid={`row-line-${idx}`}>
                    <TableCell>
                      <Select
                        value={l.productId !== null && l.productId !== undefined ? String(l.productId) : "__custom"}
                        onValueChange={(v) => onProductChange(idx, v)}
                        disabled={!isEditable}
                      >
                        <SelectTrigger><SelectValue placeholder="Pilih atau custom" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom">— Custom —</SelectItem>
                          {(products ?? []).map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="mt-2"
                        placeholder="Nama item"
                        value={l.name}
                        onChange={(e) => setLine(idx, { name: e.target.value })}
                        disabled={!isEditable}
                        data-testid={`input-line-name-${idx}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        rows={1}
                        value={l.description ?? ""}
                        onChange={(e) => setLine(idx, { description: e.target.value })}
                        disabled={!isEditable}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right"
                        value={l.quantity}
                        onChange={(e) => setLine(idx, { quantity: Number(e.target.value) })}
                        disabled={!isEditable}
                        data-testid={`input-line-qty-${idx}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="text-right"
                        value={l.unitCost}
                        onChange={(e) => setLine(idx, { unitCost: Number(e.target.value) })}
                        disabled={!isEditable}
                        data-testid={`input-line-cost-${idx}`}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {idr(Number(l.quantity || 0) * Number(l.unitCost || 0))}
                    </TableCell>
                    {isEditable && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeLine(idx)} disabled={lines.length === 1}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between mt-4 gap-6">
              <div className="w-64">
                <Label>Pajak (PPN)</Label>
                <Select value={taxRateId ? String(taxRateId) : "none"} onValueChange={(v) => setTaxRateId(v === "none" ? null : parseInt(v))} disabled={!isEditable}>
                  <SelectTrigger data-testid="select-doc-tax"><SelectValue placeholder="Tanpa pajak" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tanpa pajak —</SelectItem>
                    {(taxes ?? []).filter((t) => t.kind === "purchase" && t.isActive).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-right space-y-1">
                <div className="text-sm text-muted-foreground">Subtotal: <span className="font-mono ml-2" data-testid="text-subtotal">{idr(subtotal)}</span></div>
                {selectedTax && <div className="text-sm text-muted-foreground">{selectedTax.name}: <span className="font-mono ml-2" data-testid="text-tax-amount">{idr(taxAmount)}</span></div>}
                <div className="text-sm text-muted-foreground">Grand Total</div>
                <div className="text-2xl font-bold" data-testid="text-total">{idr(grandTotal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isOrderView && id && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Pembayaran
              </CardTitle>
              {doc?.kind === "order" &&
                doc?.billStatus === "billed" &&
                Math.max(0, Number(doc?.grandTotal ?? 0) - Number(doc?.amountPaid ?? 0)) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openPayDialog}
                  data-testid="button-record-payment"
                >
                  <CreditCard className="mr-2 h-4 w-4" /> Bayar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <p className="text-sm text-muted-foreground">Memuat...</p>
              ) : linkedPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada pembayaran tercatat.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Mitra</TableHead>
                      <TableHead>Jurnal</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedPayments.map((p) => (
                      <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                        <TableCell>{p.date.slice(0, 10)}</TableCell>
                        <TableCell>{p.partnerName ?? "-"}</TableCell>
                        <TableCell>{journals.find((j) => j.id === p.journalId)?.name ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">{idr(Number(p.amount))}</TableCell>
                        <TableCell>
                          {p.entryId && (
                            <Link href={`/accounting/entries/${p.entryId}`}>
                              <Button variant="ghost" size="sm" data-testid={`link-entry-${p.id}`}>
                                <FileText className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Pembayaran — {doc?.docNumber}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Jurnal</Label>
              <Select value={payForm.journalId} onValueChange={(v) => setPayForm((f) => ({ ...f, journalId: v }))}>
                <SelectTrigger data-testid="select-pay-journal"><SelectValue placeholder="Pilih jurnal" /></SelectTrigger>
                <SelectContent>
                  {bankCashJournals.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>{j.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} data-testid="input-pay-date" />
            </div>
            <div className="grid gap-1.5">
              <Label>Jumlah</Label>
              <Input type="number" min="0" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} data-testid="input-pay-amount" />
            </div>
            <div className="grid gap-1.5">
              <Label>Referensi</Label>
              <Input value={payForm.ref} onChange={(e) => setPayForm((f) => ({ ...f, ref: e.target.value }))} data-testid="input-pay-ref" />
            </div>
            <div className="grid gap-1.5">
              <Label>Memo</Label>
              <Input value={payForm.memo} onChange={(e) => setPayForm((f) => ({ ...f, memo: e.target.value }))} data-testid="input-pay-memo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Batal</Button>
            <Button onClick={submitPayment} disabled={createPaymentMut.isPending} data-testid="button-submit-payment">
              Simpan Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
