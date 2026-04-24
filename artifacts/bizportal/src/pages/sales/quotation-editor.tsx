import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import {
  useGetSalesDocument,
  useCreateSalesDocument,
  useUpdateSalesDocument,
  useSalesDocumentAction,
  useDeleteSalesDocument,
  useListCustomers,
  useListProducts,
  getGetSalesDocumentQueryKey,
  getListSalesDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Send, Check, X, Receipt, Truck, Trash2, FileEdit, Save, Printer, CreditCard } from "lucide-react";
import { useCreateSalesPaymentLink } from "@workspace/api-client-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface LineDraft {
  productId?: number | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

export default function SalesDocumentEditorPage() {
  const [, paramsNew] = useRoute("/sales/quotations/new");
  const [, paramsQuote] = useRoute("/sales/quotations/:id");
  const [, paramsOrder] = useRoute("/sales/orders/:id");
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const isNew = !!paramsNew;
  const idStr = paramsQuote?.id ?? paramsOrder?.id;
  const id = idStr ? Number(idStr) : null;

  const { data: doc, isLoading: docLoading } = useGetSalesDocument(id ?? 0, {
    query: {
      enabled: !isNew && id !== null,
      queryKey: getGetSalesDocumentQueryKey(id ?? 0),
    },
  });

  const paylabsMut = useCreateSalesPaymentLink();
  const downloadPdf = () => {
    if (id) window.open(`/api/sales/documents/${id}/pdf`, "_blank");
  };
  const payViaPaylabs = async () => {
    if (!id) return;
    try {
      const res = await paylabsMut.mutateAsync({ id });
      if (res.payment.paymentUrl) {
        window.open(res.payment.paymentUrl, "_blank");
        toast({ title: "Link pembayaran dibuat", description: "Membuka tab baru..." });
      } else if (!res.configured) {
        toast({ title: "Mode simulasi", description: res.message ?? "Paylabs belum dikonfigurasi." });
      } else {
        toast({ title: "Pembayaran dibuat", description: `ID: ${res.payment.id}` });
      }
    } catch (e: any) {
      toast({ title: "Gagal membuat link pembayaran", description: String(e?.message ?? e), variant: "destructive" });
    }
  };
  const { data: customers } = useListCustomers();
  const { data: products } = useListProducts();
  const createMut = useCreateSalesDocument();
  const updateMut = useUpdateSalesDocument();
  const actionMut = useSalesDocumentAction();
  const deleteMut = useDeleteSalesDocument();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { name: "", quantity: 1, unitPrice: 0 },
  ]);

  useEffect(() => {
    if (doc) {
      setCustomerId(doc.customerId ?? null);
      setCustomerName(doc.customerName);
      setValidUntil(doc.validUntil ? doc.validUntil.slice(0, 10) : "");
      setExpectedDate(doc.expectedDate ? doc.expectedDate.slice(0, 10) : "");
      setNotes(doc.notes ?? "");
      setLines(
        doc.lines.length > 0
          ? doc.lines.map((l) => ({
              productId: l.productId ?? null,
              name: l.name,
              description: l.description ?? null,
              quantity: Number(l.quantity),
              unitPrice: Number(l.unitPrice),
            }))
          : [{ name: "", quantity: 1, unitPrice: 0 }],
      );
    }
  }, [doc]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0),
    [lines],
  );

  const isEditable = isNew || (doc && (doc.status === "draft" || doc.status === "sent"));

  const setLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((arr) => [...arr, { name: "", quantity: 1, unitPrice: 0 }]);
  const removeLine = (idx: number) => setLines((arr) => arr.filter((_, i) => i !== idx));

  const onProductChange = (idx: number, productIdStr: string) => {
    if (productIdStr === "__custom") {
      setLine(idx, { productId: null });
      return;
    }
    const pid = Number(productIdStr);
    const product = (products ?? []).find((p) => p.id === pid);
    if (product) {
      setLine(idx, {
        productId: pid,
        name: product.name,
        unitPrice: Number(product.price),
      });
    }
  };

  const onCustomerChange = (val: string) => {
    if (val === "__none") {
      setCustomerId(null);
      return;
    }
    const cid = Number(val);
    setCustomerId(cid);
    const c = (customers ?? []).find((x) => x.id === cid);
    if (c) setCustomerName(c.name);
  };

  const validate = (): string | null => {
    if (!customerName.trim()) return "Customer wajib diisi";
    if (lines.length === 0) return "Minimal satu baris item";
    for (const l of lines) {
      if (!l.name.trim()) return "Nama produk pada setiap baris wajib diisi";
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
      kind: "quote" as const,
      customerId,
      customerName,
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      expectedDate: expectedDate ? new Date(expectedDate).toISOString() : null,
      notes: notes || null,
      lines: lines.map((l) => ({
        productId: l.productId ?? null,
        name: l.name,
        description: l.description ?? null,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
      })),
    };
    try {
      if (isNew) {
        const created = await createMut.mutateAsync({ data: body });
        qc.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey() });
        toast({ title: "Quotation dibuat", description: created.docNumber });
        navigate(`/sales/quotations/${created.id}`);
      } else if (id) {
        await updateMut.mutateAsync({ id, data: body });
        qc.invalidateQueries({ queryKey: getGetSalesDocumentQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey() });
        toast({ title: "Quotation diperbarui" });
      }
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    }
  };

  const runAction = async (action: "send" | "confirm" | "cancel" | "draft" | "mark_invoiced" | "mark_delivered") => {
    if (!id) return;
    try {
      const result = await actionMut.mutateAsync({ id, data: { action } });
      qc.invalidateQueries({ queryKey: getGetSalesDocumentQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey() });
      toast({ title: `Status: ${result.status}` });
      if (action === "confirm") navigate(`/sales/orders/${id}`);
    } catch (e) {
      toast({ title: "Aksi gagal", description: String(e), variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!id) return;
    if (!confirm("Hapus dokumen ini?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey() });
      toast({ title: "Dihapus" });
      navigate("/sales/quotations");
    } catch (e) {
      toast({ title: "Gagal menghapus", description: String(e), variant: "destructive" });
    }
  };

  const isOrderView = !!paramsOrder;
  const backHref = isOrderView ? "/sales/orders" : "/sales/quotations";

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
              <h1 className="text-2xl font-bold">
                {isNew ? "Quotation Baru" : doc?.docNumber}
              </h1>
              {doc && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="capitalize">{doc.kind}</Badge>
                  <Badge variant="secondary" className="capitalize">{doc.status}</Badge>
                  {doc.kind === "order" && (
                    <>
                      <Badge variant="outline" className="capitalize">Invoice: {doc.invoiceStatus.replace("_", " ")}</Badge>
                      <Badge variant="outline" className="capitalize">Delivery: {doc.deliveryStatus.replace("_", " ")}</Badge>
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
            {!isNew && doc?.kind === "order" && doc?.invoiceStatus === "to_invoice" && (
              <Button variant="outline" onClick={() => runAction("mark_invoiced")} data-testid="button-invoice"><Receipt className="mr-2 h-4 w-4" /> Invoiced</Button>
            )}
            {!isNew && doc?.kind === "order" && doc?.deliveryStatus === "to_deliver" && (
              <Button variant="outline" onClick={() => runAction("mark_delivered")} data-testid="button-deliver"><Truck className="mr-2 h-4 w-4" /> Delivered</Button>
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
            {!isNew && doc && (
              <Button variant="outline" onClick={downloadPdf} data-testid="button-download-pdf">
                <Printer className="mr-2 h-4 w-4" /> Cetak PDF
              </Button>
            )}
            {!isNew && doc?.kind === "order" && doc?.status === "confirmed" && doc?.invoiceStatus === "to_invoice" && (
              <Button variant="default" onClick={payViaPaylabs} disabled={paylabsMut.isPending} data-testid="button-pay-paylabs">
                <CreditCard className="mr-2 h-4 w-4" /> Bayar via Paylabs
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Informasi Customer</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Customer</Label>
              <Select value={customerId !== null ? String(customerId) : "__none"} onValueChange={onCustomerChange} disabled={!isEditable}>
                <SelectTrigger data-testid="select-customer"><SelectValue placeholder="Pilih customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Bebas (isi nama manual) —</SelectItem>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Nama Customer</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!isEditable} data-testid="input-customer-name" />
            </div>
            <div className="grid gap-1.5">
              <Label>Berlaku Hingga</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={!isEditable} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tanggal Diharapkan</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} disabled={!isEditable} />
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
                  <TableHead className="w-[150px] text-right">Harga Satuan</TableHead>
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
                        <SelectTrigger><SelectValue placeholder="Pilih atau ketik" /></SelectTrigger>
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
                        value={l.unitPrice}
                        onChange={(e) => setLine(idx, { unitPrice: Number(e.target.value) })}
                        disabled={!isEditable}
                        data-testid={`input-line-price-${idx}`}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {idr(Number(l.quantity || 0) * Number(l.unitPrice || 0))}
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
            <div className="flex justify-end mt-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total</div>
                <div className="text-2xl font-bold" data-testid="text-total">{idr(total)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
