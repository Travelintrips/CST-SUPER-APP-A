import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useListTaxes,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import type { Supplier } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

type FormState = {
  name: string;
  country: string;
  contactEmail: string;
  phone: string;
  address: string;
  taxId: string;
  defaultPurchaseTaxId: number | null;
  serviceType: string;
  isActive: boolean;
  logo: string;
  eta: string;
  fee: string;
  markup: string;
  note: string;
  sortOrder: string;
};

const emptyForm = (): FormState => ({
  name: "",
  country: "",
  contactEmail: "",
  phone: "",
  address: "",
  taxId: "",
  defaultPurchaseTaxId: null,
  serviceType: "",
  isActive: true,
  logo: "📦",
  eta: "",
  fee: "0",
  markup: "0",
  note: "",
  sortOrder: "0",
});

export default function VendorsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: vendors } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const { data: taxes } = useListTaxes();
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();

  const purchaseTaxes = (taxes ?? []).filter((t) => t.kind === "purchase" && t.isActive);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const set = (k: keyof FormState, v: FormState[keyof FormState]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const startEdit = (v: Supplier) => {
    setEditing(v);
    setForm({
      name: v.name,
      country: v.country ?? "",
      contactEmail: v.contactEmail ?? "",
      phone: v.phone ?? "",
      address: v.address ?? "",
      taxId: v.taxId ?? "",
      defaultPurchaseTaxId: v.defaultPurchaseTaxId ?? null,
      serviceType: v.serviceType ?? "",
      isActive: v.isActive ?? true,
      logo: v.logo ?? "📦",
      eta: v.eta ?? "",
      fee: String(v.fee ?? 0),
      markup: String(v.markup ?? 0),
      note: v.note ?? "",
      sortOrder: String(v.sortOrder ?? 0),
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nama vendor wajib diisi", variant: "destructive" });
      return;
    }
    const body = {
      name: form.name.trim(),
      country: form.country || null,
      contactEmail: form.contactEmail || null,
      phone: form.phone || null,
      address: form.address || null,
      taxId: form.taxId || null,
      defaultPurchaseTaxId: form.defaultPurchaseTaxId,
      serviceType: form.serviceType || null,
      isActive: form.isActive,
      logo: form.logo || "📦",
      eta: form.eta || null,
      fee: parseFloat(form.fee) || 0,
      markup: parseFloat(form.markup) || 0,
      note: form.note || null,
      sortOrder: parseInt(form.sortOrder) || 0,
    };
    try {
      if (editing) {
        const updated = await updateMut.mutateAsync({ id: editing.id, data: body });
        qc.setQueryData<Supplier[]>(getListSuppliersQueryKey(), (old) =>
          old ? old.map((s) => (s.id === updated.id ? updated : s)) : [updated]
        );
        qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: "Vendor diperbarui" });
      } else {
        const created = await createMut.mutateAsync({ data: body });
        qc.setQueryData<Supplier[]>(getListSuppliersQueryKey(), (old) =>
          old ? [...old, created] : [created]
        );
        qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: "Vendor dibuat" });
      }
      reset();
      setOpen(false);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Hapus vendor ini?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      toast({ title: "Vendor dihapus" });
    } catch (e) {
      toast({ title: "Gagal menghapus", description: String(e), variant: "destructive" });
    }
  };

  const taxLabel = (id: number | null | undefined) => {
    if (!id) return "-";
    const t = (taxes ?? []).find((x) => x.id === id);
    return t ? `${t.name} (${t.rate}%)` : "-";
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Vendors</h1>
            <p className="text-sm text-muted-foreground">Kelola pemasok, supplier, dan vendor layanan pengiriman.</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-vendor">
                <Plus className="mr-2 h-4 w-4" /> New Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Vendor" : "Vendor Baru"}</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="bisnis">
                <TabsList className="w-full">
                  <TabsTrigger value="bisnis" className="flex-1">Informasi Bisnis</TabsTrigger>
                  <TabsTrigger value="layanan" className="flex-1">Layanan Pengiriman</TabsTrigger>
                </TabsList>

                <TabsContent value="bisnis" className="mt-3 grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Nama *</Label>
                    <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="input-vendor-name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="country">Negara</Label>
                      <Input id="country" value={form.country} onChange={(e) => set("country", e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="phone">Telepon</Label>
                      <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Email Kontak</Label>
                    <Input id="email" type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="taxId">NPWP</Label>
                    <Input id="taxId" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder="cth. 01.234.567.8-901.000" data-testid="input-vendor-npwp" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="address">Alamat</Label>
                    <Textarea id="address" value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tarif Pajak Default (PPN Pembelian)</Label>
                    <Select
                      value={form.defaultPurchaseTaxId ? String(form.defaultPurchaseTaxId) : "none"}
                      onValueChange={(v) => set("defaultPurchaseTaxId", v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger data-testid="select-vendor-tax">
                        <SelectValue placeholder="Gunakan default global" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Gunakan default global —</SelectItem>
                        {purchaseTaxes.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="layanan" className="mt-3 grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="serviceType">Tipe Layanan</Label>
                    <Input id="serviceType" value={form.serviceType} onChange={(e) => set("serviceType", e.target.value)} placeholder="cth. sea, air, darat" />
                    <p className="text-xs text-muted-foreground">Pisahkan dengan koma bila lebih dari satu (cth. sea, air). Kosongkan untuk semua jenis.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="logo">Ikon / Logo</Label>
                      <Input id="logo" value={form.logo} onChange={(e) => set("logo", e.target.value)} placeholder="📦" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="eta">Estimasi (ETA)</Label>
                      <Input id="eta" value={form.eta} onChange={(e) => set("eta", e.target.value)} placeholder="cth. 2-3 hari" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="fee">Tarif Dasar (Rp)</Label>
                      <Input id="fee" type="number" min="0" value={form.fee} onChange={(e) => set("fee", e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="markup">Markup (%)</Label>
                      <Input id="markup" type="number" min="0" step="0.01" value={form.markup} onChange={(e) => set("markup", e.target.value)} placeholder="cth. 20" />
                    </div>
                  </div>
                  {(() => {
                    const base = parseFloat(form.fee) || 0;
                    const pct = parseFloat(form.markup) || 0;
                    if (base <= 0) return null;
                    const after = Math.round(base * (1 + pct / 100));
                    return (
                      <p className="text-xs text-muted-foreground -mt-1">
                        Setelah markup: <span className="font-semibold text-foreground">Rp {after.toLocaleString("id-ID")}</span>
                      </p>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="sortOrder">Urutan Tampil</Label>
                      <Input id="sortOrder" type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="note">Catatan</Label>
                    <Textarea id="note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Catatan tambahan untuk vendor ini" />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch id="isActive" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                    <Label htmlFor="isActive">Aktif (tampil di portal & notifikasi)</Label>
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save-vendor">
                  {editing ? "Simpan" : "Buat"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe Layanan</TableHead>
                  <TableHead>Negara</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead className="text-right">Tarif Dasar</TableHead>
                  <TableHead className="text-right">Markup (%)</TableHead>
                  <TableHead className="text-right">Setelah Markup</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(vendors ?? []).map((v) => {
                  const baseFee = Number(v.fee ?? 0);
                  const markupPct = Number(v.markup ?? 0);
                  const afterMarkup = baseFee * (1 + markupPct / 100);
                  return (
                  <TableRow key={v.id} data-testid={`row-vendor-${v.id}`}>
                    <TableCell>
                      <span className="mr-1.5">{v.logo}</span>
                      <span className="font-medium">{v.name}</span>
                    </TableCell>
                    <TableCell>
                      {v.serviceType
                        ? <Badge variant="secondary" className="text-xs">{v.serviceType}</Badge>
                        : <span className="text-muted-foreground text-xs">Semua</span>}
                    </TableCell>
                    <TableCell>{v.country ?? "-"}</TableCell>
                    <TableCell>{v.phone ?? "-"}</TableCell>
                    <TableCell>{v.eta ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {baseFee > 0 ? `Rp ${baseFee.toLocaleString("id-ID")}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {markupPct > 0 ? `${markupPct}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-primary">
                      {baseFee > 0 ? `Rp ${Math.round(afterMarkup).toLocaleString("id-ID")}` : "-"}
                    </TableCell>
                    <TableCell>
                      {v.isActive
                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Aktif</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">Nonaktif</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(v)} data-testid={`button-edit-vendor-${v.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(v.id)} data-testid={`button-delete-vendor-${v.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {(!vendors || vendors.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Belum ada vendor.
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
