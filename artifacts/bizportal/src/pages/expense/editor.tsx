import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  useGetExpense, useCreateExpense, useUpdateExpense, useExpenseAction,
  useAddExpenseAttachment, useDeleteExpenseAttachment,
  useListExpenseCategories, useListAccounts, useListTaxes,
  getListExpensesQueryKey, getGetExpenseQueryKey,
  type ExpenseAttachment,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Send, CheckCircle, XCircle, FileText, Banknote,
  RotateCcw, Info, Paperclip, Upload, Trash2, Loader2, AlertTriangle, X,
} from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function getServeUrl(objectPath: string) {
  if (objectPath.startsWith("/objects/")) return `/api/storage${objectPath}`;
  return objectPath;
}

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : (e as { message?: string })?.message ?? fallback;
}

function AttachmentItem({
  att,
  onDelete,
  deleting,
}: {
  att: ExpenseAttachment;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const url = getServeUrl(att.objectPath);
  const isImage = (att.contentType ?? "").startsWith("image/");
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:bg-muted/30 transition-colors">
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
        {isImage ? (
          <img src={url} alt={att.fileName} className="h-12 w-12 rounded border object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded border bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <a href={url} target="_blank" rel="noreferrer"
          className="block truncate text-sm font-medium hover:underline text-foreground">
          {att.fileName}
        </a>
        <p className="text-xs text-muted-foreground">
          {new Date(att.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive h-8 w-8"
        onClick={() => onDelete(att.id)} disabled={deleting}>
        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  approved: "Disetujui",
  posted: "Diposting",
  paid: "Lunas",
  rejected: "Ditolak",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-800 text-slate-300 border-slate-600",
  submitted: "bg-sky-900/40 text-sky-300 border-sky-600",
  approved: "bg-indigo-900/40 text-indigo-300 border-indigo-600",
  posted: "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  paid: "bg-green-900/50 text-green-300 border-green-600",
  rejected: "bg-red-900/40 text-red-300 border-red-600",
};

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vendorEmployee: "",
  expenseType: "vendor_bill" as "vendor_bill" | "reimbursement" | "internal",
  categoryId: null as number | null,
  description: "",
  qty: 1,
  unit: "",
  unitPrice: 0,
  taxRateId: null as number | null,
  currency: "IDR",
  notes: "",
  expenseAccountId: null as number | null,
  payableAccountId: null as number | null,
};

export default function ExpenseEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === "new";
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const expId = isNew ? 0 : Number(id);
  const { data: expense, isLoading } = useGetExpense(
    expId,
    { query: { enabled: !isNew, queryKey: getGetExpenseQueryKey(expId) } },
  );
  const { data: cats = [] } = useListExpenseCategories();
  const { data: accounts = [] } = useListAccounts();
  const { data: taxes = [] } = useListTaxes();

  const createMut = useCreateExpense();
  const updateMut = useUpdateExpense();
  const actionMut = useExpenseAction();
  const addAttachmentMut = useAddExpenseAttachment();
  const deleteAttachmentMut = useDeleteExpenseAttachment();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingAttId, setDeletingAttId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile } = useUpload({
    onError: (err) => {
      toast({ title: `Upload gagal: ${err.message}`, variant: "destructive" });
      setUploading(false);
    },
  });

  useEffect(() => {
    if (expense && !isNew) {
      setForm({
        date: expense.date,
        vendorEmployee: expense.vendorEmployee ?? "",
        expenseType: expense.expenseType as any,
        categoryId: expense.categoryId ?? null,
        description: expense.description ?? "",
        qty: expense.qty,
        unit: expense.unit ?? "",
        unitPrice: expense.unitPrice,
        taxRateId: expense.taxRateId ?? null,
        currency: expense.currency,
        notes: expense.notes ?? "",
        expenseAccountId: expense.expenseAccountId ?? null,
        payableAccountId: expense.payableAccountId ?? null,
      });
    }
  }, [expense]);

  const selectedTax = taxes.find((t) => t.id === form.taxRateId);
  const subtotal = Math.round(form.qty * form.unitPrice * 100) / 100;
  const taxAmount = selectedTax ? Math.round(subtotal * selectedTax.rate / 100 * 100) / 100 : 0;
  const total = subtotal + taxAmount;

  const canEdit = isNew || (expense?.status === "draft") || (expense?.status === "rejected");
  const locked = !canEdit;

  const onCategoryChange = (catId: number | null) => {
    const cat = cats.find((c) => c.id === catId);
    setForm((f) => ({
      ...f,
      categoryId: catId,
      expenseAccountId: cat?.expenseAccountId ?? f.expenseAccountId,
      payableAccountId: cat?.payableAccountId ?? f.payableAccountId,
    }));
  };

  const save = async () => {
    if (!form.date) { toast({ title: "Tanggal wajib diisi", variant: "destructive" }); return; }
    const body = {
      date: form.date,
      vendorEmployee: form.vendorEmployee || undefined,
      expenseType: form.expenseType,
      categoryId: form.categoryId || undefined,
      description: form.description || undefined,
      qty: form.qty,
      unit: form.unit || undefined,
      unitPrice: form.unitPrice,
      taxRateId: form.taxRateId || undefined,
      currency: form.currency,
      notes: form.notes || undefined,
      expenseAccountId: form.expenseAccountId || undefined,
      payableAccountId: form.payableAccountId || undefined,
    };
    try {
      if (isNew) {
        const created = await createMut.mutateAsync({ data: body });
        qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
        toast({ title: "Expense dibuat" });
        navigate(`/expense/${created.id}`);
      } else {
        await updateMut.mutateAsync({ id: Number(id), data: body });
        qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
        toast({ title: "Expense diperbarui" });
      }
    } catch (e: any) {
      toast({ title: e?.message ?? "Gagal menyimpan", variant: "destructive" });
    }
  };

  const doAction = async (action: string, reason?: string) => {
    try {
      await actionMut.mutateAsync({
        id: Number(id),
        data: { action: action as any, reason },
      });
      qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      toast({ title: `Expense di-${action}` });
    } catch (e: any) {
      toast({ title: e?.message ?? "Gagal", variant: "destructive" });
    }
  };

  const handleUpload = async () => {
    if (!pendingFile || isNew) return;
    setUploading(true);
    const result = await uploadFile(pendingFile);
    if (!result) return;
    addAttachmentMut.mutate(
      {
        id: expId,
        data: {
          objectPath: result.objectPath,
          fileName: pendingFile.name,
          contentType: pendingFile.type || "application/octet-stream",
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Lampiran berhasil diunggah" });
          setPendingFile(null);
          setUploading(false);
          qc.invalidateQueries({ queryKey: getGetExpenseQueryKey(expId) });
        },
        onError: (e: unknown) => {
          toast({ title: errMsg(e, "Gagal menyimpan lampiran"), variant: "destructive" });
          setUploading(false);
        },
      },
    );
  };

  const handleDeleteAttachment = async (attId: number) => {
    setDeletingAttId(attId);
    deleteAttachmentMut.mutate(
      { id: expId, attId },
      {
        onSuccess: () => {
          toast({ title: "Lampiran dihapus" });
          qc.invalidateQueries({ queryKey: getGetExpenseQueryKey(expId) });
        },
        onError: (e: unknown) => {
          toast({ title: errMsg(e, "Gagal hapus lampiran"), variant: "destructive" });
        },
        onSettled: () => setDeletingAttId(null),
      },
    );
  };

  if (!isNew && isLoading) {
    return <AppShell><div className="p-8 text-muted-foreground">Memuat data...</div></AppShell>;
  }

  const status = expense?.status ?? "draft";

  return (
    <AppShell>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/expense")}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">
                {isNew ? "Buat Expense Baru" : expense?.expenseNumber}
              </h1>
              {!isNew && (
                <Badge className={`text-xs border ${STATUS_COLORS[status] ?? ""}`}>
                  {STATUS_LABELS[status] ?? status}
                </Badge>
              )}
            </div>
            {!isNew && <p className="text-sm text-muted-foreground">Dibuat {expense?.createdAt?.slice(0, 10)}</p>}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {canEdit && (
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                <Save size={14} className="mr-1" />
                Simpan
              </Button>
            )}
            {!isNew && status === "draft" && (
              <Button variant="secondary" onClick={() => doAction("submit")} disabled={actionMut.isPending}>
                <Send size={14} className="mr-1" />
                Ajukan
              </Button>
            )}
            {!isNew && status === "submitted" && (
              <>
                <Button className="bg-emerald-700 hover:bg-emerald-600" onClick={() => doAction("approve")} disabled={actionMut.isPending}>
                  <CheckCircle size={14} className="mr-1" />
                  Setujui
                </Button>
                <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={actionMut.isPending}>
                  <XCircle size={14} className="mr-1" />
                  Tolak
                </Button>
              </>
            )}
            {!isNew && status === "approved" && (
              <Button className="bg-indigo-700 hover:bg-indigo-600" onClick={() => doAction("post")} disabled={actionMut.isPending}>
                <FileText size={14} className="mr-1" />
                Posting
              </Button>
            )}
            {!isNew && status === "posted" && (
              <Button className="bg-green-700 hover:bg-green-600" onClick={() => doAction("pay")} disabled={actionMut.isPending}>
                <Banknote size={14} className="mr-1" />
                Tandai Lunas
              </Button>
            )}
            {!isNew && (status === "submitted" || status === "rejected") && (
              <Button variant="outline" onClick={() => doAction("reset")} disabled={actionMut.isPending}>
                <RotateCcw size={14} className="mr-1" />
                Reset ke Draft
              </Button>
            )}
          </div>
        </div>

        {/* Rejection reason banner */}
        {!isNew && expense?.rejectionReason && (
          <div className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
            <Info size={15} className="mt-0.5 shrink-0" />
            <div><span className="font-medium">Alasan penolakan: </span>{expense.rejectionReason}</div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Left column */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Informasi Dasar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tanggal <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date} disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipe Expense</Label>
                <Select value={form.expenseType} disabled={locked}
                  onValueChange={(v) => setForm((f) => ({ ...f, expenseType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendor_bill">Tagihan Vendor</SelectItem>
                    <SelectItem value="reimbursement">Reimburse Karyawan</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendor / Karyawan</Label>
                <Input placeholder="Nama vendor atau karyawan" value={form.vendorEmployee}
                  disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, vendorEmployee: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select
                  value={form.categoryId?.toString() ?? "none"}
                  disabled={locked}
                  onValueChange={(v) => onCategoryChange(v === "none" ? null : Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih kategori..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tidak dipilih —</SelectItem>
                    {cats.filter((c) => c.isActive).map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deskripsi</Label>
                <Input placeholder="Deskripsi singkat biaya" value={form.description}
                  disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Catatan Internal</Label>
                <Textarea placeholder="Catatan tambahan..." value={form.notes}
                  disabled={locked}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </CardContent>
          </Card>

          {/* Right column */}
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Nominal & Pajak</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Qty</Label>
                    <Input type="number" min="0" step="any" value={form.qty} disabled={locked}
                      onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Satuan</Label>
                    <Input placeholder="pcs, kg, trip..." value={form.unit} disabled={locked}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Harga Satuan (IDR)</Label>
                  <Input type="number" min="0" step="any" value={form.unitPrice} disabled={locked}
                    onChange={(e) => setForm((f) => ({ ...f, unitPrice: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pajak</Label>
                  <Select
                    value={form.taxRateId?.toString() ?? "none"}
                    disabled={locked}
                    onValueChange={(v) => setForm((f) => ({ ...f, taxRateId: v === "none" ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Tidak ada pajak" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tidak ada pajak</SelectItem>
                      {taxes.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name} ({t.rate}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{idr(subtotal)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pajak ({selectedTax?.rate}%)</span>
                      <span>{idr(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-1">
                    <span>Total</span>
                    <span className="text-primary">{idr(total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Override Akun (Opsional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Jika kosong, akan menggunakan akun dari kategori atau pengaturan akuntansi.
                </p>
                <div className="space-y-1.5">
                  <Label>Akun Biaya (Debit)</Label>
                  <Select
                    value={form.expenseAccountId?.toString() ?? "none"}
                    disabled={locked}
                    onValueChange={(v) => setForm((f) => ({ ...f, expenseAccountId: v === "none" ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Dari kategori / default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Dari kategori / default —</SelectItem>
                      {accounts.filter((a) => a.type === "expense" || a.type === "asset").map((a) => (
                        <SelectItem key={a.id} value={a.id.toString()}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Akun Hutang (Kredit)</Label>
                  <Select
                    value={form.payableAccountId?.toString() ?? "none"}
                    disabled={locked}
                    onValueChange={(v) => setForm((f) => ({ ...f, payableAccountId: v === "none" ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Dari kategori / default" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Dari kategori / default —</SelectItem>
                      {accounts.filter((a) => a.type === "liability").map((a) => (
                        <SelectItem key={a.id} value={a.id.toString()}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Accounting entry info */}
            {!isNew && expense?.entryId && (
              <Card className="border-emerald-800">
                <CardContent className="pt-4 flex items-start gap-2 text-sm">
                  <Info size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-emerald-300 font-medium">Jurnal telah dibuat</p>
                    <p className="text-muted-foreground text-xs">Entry ID #{expense.entryId}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/*
          Attachment panel — only shown for saved expenses.
          Upload/delete are intentionally allowed in all statuses including posted/paid:
          Finance staff may need to add documents retroactively, and the backend does
          not restrict attachment mutations by status.
        */}
        {!isNew && (() => {
          const attachments = expense?.attachments ?? [];
          const selectedCat = cats.find((c) => c.id === form.categoryId);
          const attachmentRequired = selectedCat?.requiresAttachment === true;
          const missingRequired = attachmentRequired && attachments.length === 0;

          return (
            <Card className={missingRequired ? "border-amber-600" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Paperclip size={14} className="text-muted-foreground" />
                  <CardTitle className="text-sm">
                    Lampiran
                    {attachmentRequired && (
                      <Badge variant="outline" className="ml-2 text-amber-400 border-amber-500 text-xs">Wajib</Badge>
                    )}
                  </CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">{attachments.length} file</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {missingRequired && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>Kategori <strong>{selectedCat?.name}</strong> mewajibkan lampiran bukti. Harap unggah dokumen pendukung sebelum mengajukan expense.</span>
                  </div>
                )}

                {/* Existing attachments */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <AttachmentItem
                        key={att.id}
                        att={att}
                        onDelete={handleDeleteAttachment}
                        deleting={deletingAttId === att.id}
                      />
                    ))}
                  </div>
                )}

                {/* Upload zone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPendingFile(f);
                    e.target.value = "";
                  }}
                />
                {pendingFile ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-primary shrink-0" />
                      <span className="flex-1 truncate text-sm">{pendingFile.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={() => setPendingFile(null)} disabled={uploading}>
                        <X size={12} />
                      </Button>
                    </div>
                    <Button size="sm" onClick={handleUpload} disabled={uploading} className="w-full">
                      {uploading
                        ? <><Loader2 size={13} className="mr-1.5 animate-spin" />Mengunggah...</>
                        : <><Upload size={13} className="mr-1.5" />Upload Lampiran</>}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="w-full"
                    onClick={() => fileInputRef.current?.click()}>
                    <Upload size={13} className="mr-1.5" />
                    Pilih File (Gambar / PDF / Dokumen)
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Alasan Penolakan</Label>
            <Textarea placeholder="Jelaskan alasan penolakan..." value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={async () => {
              await doAction("reject", rejectReason);
              setRejectOpen(false);
              setRejectReason("");
            }}>Tolak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
