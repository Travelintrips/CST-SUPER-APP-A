import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, PackageSearch, Search } from "lucide-react";

interface InvItem {
  id: number; name: string; sku: string; unit: string;
  min_stock: string; cost_price: string; note: string | null; is_active: boolean;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID");

export default function PosInventoryItemsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvItem | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", sku: "", unit: "gram", minStock: "", costPrice: "", note: "", isActive: true });

  const { data: items = [], isLoading } = useQuery<InvItem[]>({
    queryKey: ["pos-inventory-items"],
    queryFn: () => apiFetch("/pos-inventory/inventory-items"),
  });

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()));

  const saveMutation = useMutation({
    mutationFn: (data: typeof form & { id?: number }) => {
      const payload = { ...data, minStock: Number(data.minStock), costPrice: Number(data.costPrice) };
      if (data.id) return apiFetch(`/pos-inventory/inventory-items/${data.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return apiFetch("/pos-inventory/inventory-items", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-inventory-items"] }); toast({ title: "Berhasil disimpan" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/inventory-items/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-inventory-items"] }); toast({ title: "Item dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm({ name: "", sku: "", unit: "gram", minStock: "", costPrice: "", note: "", isActive: true });
    setOpen(true);
  }

  function openEdit(item: InvItem) {
    setEditing(item);
    setForm({ name: item.name, sku: item.sku, unit: item.unit, minStock: item.min_stock, costPrice: item.cost_price, note: item.note ?? "", isActive: item.is_active });
    setOpen(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.sku.trim()) { toast({ title: "Nama dan SKU wajib diisi", variant: "destructive" }); return; }
    saveMutation.mutate({ ...form, id: editing?.id });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <PackageSearch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Master Bahan Baku</h1>
              <p className="text-sm text-muted-foreground">Kelola inventory bahan baku & item stok</p>
            </div>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Tambah Bahan Baku
          </Button>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari nama atau SKU..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Daftar Bahan Baku ({filtered.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nama Bahan</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Stok Min</TableHead>
                    <TableHead className="text-right">Harga Modal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right">{fmt(item.min_stock)}</TableCell>
                      <TableCell className="text-right">Rp {fmt(item.cost_price)}</TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? "default" : "secondary"}>
                          {item.is_active ? "Aktif" : "Non-aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive"
                            onClick={() => { if (confirm("Hapus item ini?")) deleteMutation.mutate(item.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Bahan Baku" : "Tambah Bahan Baku"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Bahan *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bubuk Thai Tea" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU *</Label>
                <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} placeholder="SKU-001" />
              </div>
              <div className="space-y-2">
                <Label>Satuan</Label>
                <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="gram, ml, pcs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stok Minimum</Label>
                <Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Harga Modal (Rp)</Label>
                <Input type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
