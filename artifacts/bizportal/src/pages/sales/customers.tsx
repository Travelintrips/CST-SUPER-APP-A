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
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useListTaxes,
  getListCustomersQueryKey,
  type Customer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

export default function CustomersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: customers } = useListCustomers({ query: { queryKey: getListCustomersQueryKey() } });
  const { data: taxes } = useListTaxes();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const deleteMut = useDeleteCustomer();

  const saleTaxes = (taxes ?? []).filter((t) => t.kind === "sale" && t.isActive);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    taxId: "",
    address: "",
    notes: "",
    defaultSalesTaxId: null as number | null,
  });

  const reset = () => {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", taxId: "", address: "", notes: "", defaultSalesTaxId: null });
  };

  const startEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      taxId: c.taxId ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
      defaultSalesTaxId: c.defaultSalesTaxId ?? null,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nama wajib diisi", variant: "destructive" });
      return;
    }
    const body = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      taxId: form.taxId || null,
      address: form.address || null,
      notes: form.notes || null,
      defaultSalesTaxId: form.defaultSalesTaxId,
    };
    try {
      if (editing) {
        const updated = await updateMut.mutateAsync({ id: editing.id, data: body });
        qc.setQueryData<Customer[]>(getListCustomersQueryKey(), (old) =>
          old ? old.map((c) => (c.id === updated.id ? updated : c)) : [updated]
        );
        toast({ title: "Customer diperbarui" });
      } else {
        const created = await createMut.mutateAsync({ data: body });
        qc.setQueryData<Customer[]>(getListCustomersQueryKey(), (old) =>
          old ? [...old, created] : [created]
        );
        toast({ title: "Customer dibuat" });
      }
      qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      reset();
      setOpen(false);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Hapus customer ini?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      toast({ title: "Customer dihapus" });
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
            <h1 className="text-2xl font-bold">Customers</h1>
            <p className="text-sm text-muted-foreground">Kelola data pelanggan.</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-customer">
                <Plus className="mr-2 h-4 w-4" /> New Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Customer" : "Customer Baru"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Nama</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-customer-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Telepon</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="taxId">NPWP / Tax ID</Label>
                  <Input id="taxId" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="address">Alamat</Label>
                  <Textarea id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="notes">Catatan</Label>
                  <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Tarif Pajak Default (PPN Penjualan)</Label>
                  <Select
                    value={form.defaultSalesTaxId ? String(form.defaultSalesTaxId) : "none"}
                    onValueChange={(v) => setForm({ ...form, defaultSalesTaxId: v === "none" ? null : parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-customer-tax">
                      <SelectValue placeholder="Gunakan default global" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Gunakan default global —</SelectItem>
                      {saleTaxes.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save-customer">
                  {editing ? "Simpan" : "Buat"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>NPWP</TableHead>
                  <TableHead>Pajak Default</TableHead>
                  <TableHead className="w-[120px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(customers ?? []).map((c) => (
                  <TableRow key={c.id} data-testid={`row-customer-${c.id}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.email ?? "-"}</TableCell>
                    <TableCell>{c.phone ?? "-"}</TableCell>
                    <TableCell>{c.taxId ?? "-"}</TableCell>
                    <TableCell>{taxLabel(c.defaultSalesTaxId)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(c)} data-testid={`button-edit-customer-${c.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(c.id)} data-testid={`button-delete-customer-${c.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!customers || customers.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Belum ada customer.
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
