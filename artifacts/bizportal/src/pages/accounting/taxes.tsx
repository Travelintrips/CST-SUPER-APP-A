import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListTaxes, useCreateTax, useUpdateTax, useListAccounts,
  getListTaxesQueryKey, type AccountingTax,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Receipt } from "lucide-react";

export default function TaxesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: taxes } = useListTaxes();
  const { data: accounts } = useListAccounts();
  const createMut = useCreateTax();
  const updateMut = useUpdateTax();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingTax | null>(null);
  const [form, setForm] = useState({
    name: "", rate: 0, kind: "sale" as AccountingTax["kind"], accountId: 0, isActive: true,
  });

  const reset = () => { setEditing(null); setForm({ name: "", rate: 0, kind: "sale", accountId: 0, isActive: true }); };

  const startEdit = (t: AccountingTax) => {
    setEditing(t);
    setForm({ name: t.name, rate: t.rate, kind: t.kind, accountId: t.accountId, isActive: t.isActive });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.accountId) {
      toast({ title: "Nama & akun wajib diisi", variant: "destructive" }); return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: form });
        toast({ title: "Pajak diperbarui" });
      } else {
        await createMut.mutateAsync({ data: form });
        toast({ title: "Pajak dibuat" });
      }
      qc.invalidateQueries({ queryKey: getListTaxesQueryKey() });
      reset(); setOpen(false);
    } catch (e: any) {
      toast({ title: "Gagal", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const accLabel = (id: number) => {
    const a = accounts?.find((x) => x.id === id);
    return a ? `${a.code} ${a.name}` : `#${id}`;
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="h-6 w-6" />Pajak</h1>
            <p className="text-sm text-muted-foreground">PPN keluaran/masukan & PPh (Pajak Penghasilan)</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button data-testid="button-add-tax"><Plus className="h-4 w-4 mr-2" />Tambah Pajak</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit Pajak" : "Pajak Baru"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nama</Label><Input data-testid="input-tax-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PPN 11% Keluaran" /></div>
                <div><Label>Tarif (%)</Label><Input data-testid="input-tax-rate" type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })} /></div>
                <div>
                  <Label>Jenis</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as AccountingTax["kind"] })}>
                    <SelectTrigger data-testid="select-tax-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">PPN Penjualan (Output/Keluaran)</SelectItem>
                      <SelectItem value="purchase">PPN Pembelian (Input/Masukan)</SelectItem>
                      <SelectItem value="withholding">PPh (Pajak Penghasilan)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Akun Pajak</Label>
                  <Select value={String(form.accountId || "")} onValueChange={(v) => setForm({ ...form, accountId: parseInt(v) })}>
                    <SelectTrigger data-testid="select-tax-account"><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                    <SelectContent>
                      {(accounts ?? []).filter((a) => a.type === "liability" || a.type === "asset").map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <Label htmlFor="active">Aktif</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button onClick={submit} data-testid="button-save-tax">Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card><CardContent className="p-4">
          <Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Tarif</TableHead><TableHead>Jenis</TableHead><TableHead>Akun</TableHead><TableHead>Status</TableHead><TableHead className="w-20 text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {(taxes ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Tidak ada pajak</TableCell></TableRow>
              ) : taxes!.map((t) => (
                <TableRow key={t.id} data-testid={`row-tax-${t.id}`}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.rate}%</TableCell>
                  <TableCell><Badge variant="outline">{t.kind === "sale" ? "PPN Keluaran" : t.kind === "purchase" ? "PPN Masukan" : "PPh"}</Badge></TableCell>
                  <TableCell className="text-xs">{accLabel(t.accountId)}</TableCell>
                  <TableCell>{t.isActive ? <Badge>Aktif</Badge> : <Badge variant="secondary">Non-aktif</Badge>}</TableCell>
                  <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => startEdit(t)} data-testid={`button-edit-${t.id}`}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </AppShell>
  );
}
