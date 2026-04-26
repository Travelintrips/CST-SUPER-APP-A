import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { ScanDocumentDialog, type ScannedDocumentData } from "@/components/ScanDocumentDialog";
import { SendEmailDialog } from "@/components/SendEmailDialog";
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
  useGetSalesDocument,
  useCreateSalesDocument,
  useUpdateSalesDocument,
  useSalesDocumentAction,
  useDeleteSalesDocument,
  useListCustomers,
  useListProducts,
  useListTaxes,
  useGetAccountingSettings,
  useListAccountingPayments,
  useCreateAccountingPayment,
  useListJournals,
  getGetSalesDocumentQueryKey,
  getListSalesDocumentsQueryKey,
  getListAccountingPaymentsQueryKey,
  getListProductsQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Send, Check, X, Receipt, Truck, Trash2, FileEdit, Save, Printer, CreditCard, Wallet, FileText, ScanLine, Mail, Search, Package, Wrench, ExternalLink } from "lucide-react";
import { useCreateSalesPaymentLink } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const LOGISTICS_SUBCATEGORIES = [
  "Udara", "Laut", "Darat", "Pabean", "Handling",
  "Trucking", "Container", "Freight Forwarding", "Lainnya",
];

interface ItemPickerProps {
  products: Product[];
  onSelect: (p: Product | null) => void;
  onAddNew: () => void;
  disabled?: boolean;
  currentName?: string;
}

function ItemPicker({ products, onSelect, onAddNew, disabled, currentName }: ItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "barang" | "jasa">("all");
  const [filterSubcat, setFilterSubcat] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (filterType !== "all" && p.itemType !== filterType) return false;
      if (filterSubcat !== "all" && p.subcategory !== filterSubcat) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, filterType, filterSubcat, search]);

  return (
    <Popover open={open && !disabled} onOpenChange={(o) => { setOpen(o); if (o) setTimeout(() => searchRef.current?.focus(), 50); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="w-full justify-start text-left font-normal text-slate-300 border-slate-600 bg-slate-800/50 hover:bg-slate-700/50 truncate"
          data-testid="button-item-picker"
        >
          <Search className="h-3.5 w-3.5 mr-1.5 shrink-0 text-slate-400" />
          <span className="truncate">{currentName ? currentName : "Pilih dari master item…"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0 bg-slate-900 border-slate-700" align="start">
        <div className="p-2 border-b border-slate-700 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau SKU…"
              className="w-full pl-7 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 placeholder:text-slate-500 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1.5">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="flex-1 text-xs bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 outline-none"
            >
              <option value="all">Semua Jenis</option>
              <option value="barang">Barang</option>
              <option value="jasa">Jasa</option>
            </select>
            <select
              value={filterSubcat}
              onChange={(e) => setFilterSubcat(e.target.value)}
              className="flex-1 text-xs bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-300 outline-none"
            >
              <option value="all">Semua Sub-Kat</option>
              {LOGISTICS_SUBCATEGORIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          <button
            onClick={() => { onSelect(null); setOpen(false); setSearch(""); }}
            className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 border-b border-slate-700/50"
          >
            — Custom / isi manual —
          </button>
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-6">Tidak ada item ditemukan</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); setOpen(false); setSearch(""); }}
                className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors border-b border-slate-700/30 last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {p.itemType === "jasa"
                      ? <Wrench className="h-3 w-3 text-blue-400 shrink-0" />
                      : <Package className="h-3 w-3 text-amber-400 shrink-0" />
                    }
                    <span className="text-sm text-slate-200 truncate">{p.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{p.unit}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-5">
                  <span className="text-xs text-slate-500 font-mono">{p.sku}</span>
                  {p.subcategory && <span className="text-xs text-slate-500">· {p.subcategory}</span>}
                  {p.price > 0 && (
                    <span className="text-xs text-emerald-400 ml-auto">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(p.price)}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t border-slate-700">
          <button
            onClick={() => { setOpen(false); onAddNew(); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-800 rounded transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Item Baru ke Master
            <ExternalLink className="h-3 w-3 ml-auto" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const createPaymentMut = useCreateAccountingPayment();
  const { data: journals = [] } = useListJournals();
  const bankCashJournals = journals.filter((j) => j.type === "bank" || j.type === "cash");

  const paymentQueryParams = { sourceType: "sales_order", sourceDocId: id ?? 0 };
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
      memo: `Pembayaran invoice ${doc.docNumber ?? ""}`,
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
          paymentType: "inbound",
          amount: amt,
          journalId: Number(payForm.journalId),
          partnerName: doc.customerName,
          date: payForm.date,
          ref: payForm.ref || undefined,
          memo: payForm.memo || undefined,
          sourceType: "sales_order",
          sourceDocId: id,
        },
      });
      toast({ title: "Pembayaran dicatat", description: `Pembayaran untuk ${doc.docNumber} berhasil.` });
      qc.invalidateQueries({ queryKey: getListAccountingPaymentsQueryKey({ sourceType: "sales_order", sourceDocId: id }) });
      qc.invalidateQueries({ queryKey: getGetSalesDocumentQueryKey(id) });
      setPayDialogOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(err);
      toast({ title: "Gagal mencatat pembayaran", description: msg, variant: "destructive" });
    }
  };

  const [scanOpen, setScanOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const handleScannedData = (data: ScannedDocumentData) => {
    if (data.partyName) setCustomerName(data.partyName);
    if (data.dueDate) setValidUntil(data.dueDate.slice(0, 10));
    if (data.docDate) setExpectedDate(data.docDate.slice(0, 10));
    if (data.notes) setNotes(data.notes);
    if (data.lines && data.lines.length > 0) {
      setLines(data.lines.map((l) => ({
        name: l.name,
        description: l.description ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })));
    }
  };

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
  const { data: taxes } = useListTaxes();
  const { data: acctSettings } = useGetAccountingSettings();
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
  const [taxRateId, setTaxRateId] = useState<number | null>(null);
  const [taxApplied, setTaxApplied] = useState(false);
  const [taxAutoFilledFrom, setTaxAutoFilledFrom] = useState<"customer" | "settings" | null>(null);

  useEffect(() => {
    if (doc) {
      setCustomerId(doc.customerId ?? null);
      setCustomerName(doc.customerName);
      setValidUntil(doc.validUntil ? doc.validUntil.slice(0, 10) : "");
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
              unitPrice: Number(l.unitPrice),
            }))
          : [{ name: "", quantity: 1, unitPrice: 0 }],
      );
    }
  }, [doc]);

  useEffect(() => {
    if (isNew && !taxApplied && acctSettings?.defaultSalesTaxId) {
      setTaxRateId(acctSettings.defaultSalesTaxId);
      setTaxApplied(true);
      setTaxAutoFilledFrom("settings");
    }
  }, [isNew, taxApplied, acctSettings]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0),
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
  const addLine = () => setLines((arr) => [...arr, { name: "", quantity: 1, unitPrice: 0 }]);
  const removeLine = (idx: number) => setLines((arr) => arr.filter((_, i) => i !== idx));

  const onItemSelect = (idx: number, product: Product | null) => {
    if (!product) {
      setLine(idx, { productId: null });
      return;
    }
    setLine(idx, {
      productId: product.id,
      name: product.name,
      unitPrice: Number(product.price),
    });
    const currentCustomer = (customers ?? []).find((c) => c.id === customerId);
    setTaxRateId(
      product.defaultSalesTaxId
      ?? currentCustomer?.defaultSalesTaxId
      ?? acctSettings?.defaultSalesTaxId
      ?? null
    );
    setTaxAutoFilledFrom(null);
  };

  const onCustomerChange = (val: string) => {
    if (val === "__none") {
      setCustomerId(null);
      return;
    }
    const cid = Number(val);
    setCustomerId(cid);
    const c = (customers ?? []).find((x) => x.id === cid);
    if (c) {
      setCustomerName(c.name);
      if (isNew || taxRateId === null) {
        setTaxRateId(c.defaultSalesTaxId ?? acctSettings?.defaultSalesTaxId ?? null);
        setTaxAutoFilledFrom(c.defaultSalesTaxId ? "customer" : "settings");
      }
    }
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
      taxRateId: taxRateId ?? null,
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
                      {(() => {
                        const paid = doc.amountPaid ?? 0;
                        const total = doc.grandTotal;
                        if (paid >= total - 0.005)
                          return <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-700" data-testid="badge-payment-status">Bayar: Lunas</Badge>;
                        if (paid > 0.005)
                          return <Badge className="bg-amber-900/50 text-amber-300 border-amber-700" data-testid="badge-payment-status">Bayar: Sebagian</Badge>;
                        return <Badge variant="outline" className="text-slate-400 border-slate-600" data-testid="badge-payment-status">Bayar: Belum Bayar</Badge>;
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isEditable && (
              <Button variant="outline" onClick={() => setScanOpen(true)} data-testid="button-scan">
                <ScanLine className="mr-2 h-4 w-4" /> Scan Dokumen
              </Button>
            )}
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
            {!isNew && doc && (
              <Button variant="outline" onClick={() => setEmailOpen(true)} data-testid="button-send-email">
                <Mail className="mr-2 h-4 w-4" /> Kirim Email
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
              <DatePicker value={validUntil} onChange={setValidUntil} disabled={!isEditable} />
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
                  <TableHead className="w-[150px] text-right">Harga Satuan</TableHead>
                  <TableHead className="w-[150px] text-right">Subtotal</TableHead>
                  {isEditable && <TableHead className="w-[40px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, idx) => (
                  <TableRow key={idx} data-testid={`row-line-${idx}`}>
                    <TableCell>
                      <ItemPicker
                        products={products ?? []}
                        onSelect={(p) => onItemSelect(idx, p)}
                        onAddNew={() => navigate("/sales/items")}
                        disabled={!isEditable}
                        currentName={l.productId ? l.name : undefined}
                      />
                      <Input
                        className="mt-1.5"
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
            <div className="flex justify-between mt-4 gap-6">
              <div className="w-64">
                <Label>Pajak (PPN)</Label>
                <Select
                  value={taxRateId ? String(taxRateId) : "none"}
                  onValueChange={(v) => { setTaxRateId(v === "none" ? null : parseInt(v)); setTaxAutoFilledFrom(null); }}
                  disabled={!isEditable}
                >
                  <SelectTrigger data-testid="select-doc-tax"><SelectValue placeholder="Tanpa pajak" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tanpa pajak —</SelectItem>
                    {(taxes ?? []).filter((t) => t.kind === "sale" && t.isActive).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {taxAutoFilledFrom && taxRateId && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-tax-autofill-hint">
                    {taxAutoFilledFrom === "customer" ? "(default dari customer)" : "(default dari pengaturan)"}
                  </p>
                )}
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
                doc?.invoiceStatus === "invoiced" &&
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
              {doc?.kind === "order" && (
                <div className="mt-4 pt-3 border-t border-slate-700/50 space-y-1.5 text-sm" data-testid="payment-summary">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Total Tagihan</span>
                    <span className="font-mono tabular-nums" data-testid="summary-grand-total">{idr(Number(doc.grandTotal))}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Total Dibayar</span>
                    <span className="font-mono tabular-nums text-emerald-400" data-testid="summary-amount-paid">{idr(Number(doc.amountPaid ?? 0))}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold border-t border-slate-700/30 pt-1.5">
                    <span className="text-slate-200">Sisa</span>
                    <span
                      className={`font-mono tabular-nums ${Math.max(0, Number(doc.grandTotal) - Number(doc.amountPaid ?? 0)) > 0.005 ? "text-amber-400" : "text-emerald-400"}`}
                      data-testid="summary-balance-due"
                    >
                      {idr(Math.max(0, Number(doc.grandTotal) - Number(doc.amountPaid ?? 0)))}
                    </span>
                  </div>
                </div>
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

      <ScanDocumentDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDataExtracted={handleScannedData}
        title="Scan Dokumen Penjualan"
      />

      {!isNew && doc && id && (
        <SendEmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          docId={id}
          docNumber={doc.docNumber}
          docTitle={doc.kind === "order" ? "Sales Order" : "Quotation"}
          defaultTo={(() => { const c = (customers ?? []).find((x) => x.id === doc.customerId); return c?.email ?? ""; })()}
          module="sales"
        />
      )}
    </AppShell>
  );
}
