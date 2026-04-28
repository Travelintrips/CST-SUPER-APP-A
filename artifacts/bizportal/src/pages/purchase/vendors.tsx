import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useListTaxes,
  getListSuppliersQueryKey,
  type Supplier,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
  const [form, setForm] = useState({
    name: "",
    country: "",
    contactEmail: "",
    phone: "",
    address: "",
    taxId: "",
    defaultPurchaseTaxId: null as number | null,
  });

  const reset = () => {
    setEditing(null);
    setForm({ name: "", country: "", contactEmail: "", phone: "", address: "", taxId: "", defaultPurchaseTaxId: null });
  };

  const startEdit = (v: Supplier) => {
    setEditing(v);
    setForm({
      name: v.name,
      country: v.country,
      contactEmail: v.contactEmail,
      phone: v.phone ?? "",
      address: v.address ?? "",
      taxId: v.taxId ?? "",
      defaultPurchaseTaxId: v.defaultPurchaseTaxId ?? null,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name || !form.country || !form.contactEmail) {
      toast({ title: "Nama, negara, dan email wajib diisi", variant: "destructive" });
      return;
    }
    const body = {
      name: form.name,
      country: form.country,
      contactEmail: form.contactEmail,
      phone: form.phone || undefined,
      address: form.address || undefined,
      taxId: form.taxId || null,
      defaultPurchaseTaxId: form.defaultPurchaseTaxId,
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
            <p className="text-sm text-muted-foreground">Kelola pemasok / supplier.</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-vendor">
                <Plus className="mr-2 h-4 w-4" /> New Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Vendor" : "Vendor Baru"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Nama</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-vendor-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="country">Negara</Label>
                    <Input id="country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Telepon</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email Kontak</Label>
                  <Input id="email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="taxId">NPWP</Label>
                  <Input id="taxId" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="cth. 01.234.567.8-901.000" data-testid="input-vendor-npwp" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="address">Alamat</Label>
                  <Textarea id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Tarif Pajak Default (PPN Pembelian)</Label>
                  <Select
                    value={form.defaultPurchaseTaxId ? String(form.defaultPurchaseTaxId) : "none"}
                    onValueChange={(v) => setForm({ ...form, defaultPurchaseTaxId: v === "none" ? null : parseInt(v) })}
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
              </div>
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
                  <TableHead>Negara</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>NPWP</TableHead>
                  <TableHead>Pajak Default</TableHead>
                  <TableHead className="w-[120px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(vendors ?? []).map((v) => (
                  <TableRow key={v.id} data-testid={`row-vendor-${v.id}`}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.country}</TableCell>
                    <TableCell>{v.contactEmail}</TableCell>
                    <TableCell>{v.phone ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{v.taxId ?? "-"}</TableCell>
                    <TableCell>{taxLabel(v.defaultPurchaseTaxId)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(v)} data-testid={`button-edit-vendor-${v.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(v.id)} data-testid={`button-delete-vendor-${v.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!vendors || vendors.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
