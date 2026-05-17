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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, LayoutGrid } from "lucide-react";

interface Wh { id: number; name: string; branch_name: string; }
interface Rack { id: number; code: string; name: string; warehouse_id: number; warehouse_name: string; branch_name: string; is_active: boolean; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function PosRacksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rack | null>(null);
  const [filterWh, setFilterWh] = useState<string>("all");
  const [form, setForm] = useState({ code: "", name: "", warehouseId: "", isActive: true });

  const { data: warehouses = [] } = useQuery<Wh[]>({
    queryKey: ["pos-warehouses"],
    queryFn: () => apiFetch("/pos-inventory/warehouses"),
  });

  const { data: racks = [], isLoading } = useQuery<Rack[]>({
    queryKey: ["pos-racks", filterWh],
    queryFn: () => apiFetch(`/pos-inventory/racks${filterWh !== "all" ? `?warehouseId=${filterWh}` : ""}`),
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof form & { id?: number }) => {
      const payload = { ...data, warehouseId: Number(data.warehouseId) };
      if (data.id) return apiFetch(`/pos-inventory/racks/${data.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return apiFetch("/pos-inventory/racks", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-racks"] }); toast({ title: "Berhasil disimpan" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/racks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-racks"] }); toast({ title: "Rak dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm({ code: "", name: "", warehouseId: warehouses[0]?.id?.toString() ?? "", isActive: true });
    setOpen(true);
  }

  function openEdit(r: Rack) {
    setEditing(r);
    setForm({ code: r.code, name: r.name, warehouseId: r.warehouse_id.toString(), isActive: r.is_active });
    setOpen(true);
  }

  function handleSave() {
    if (!form.code.trim() || !form.name.trim() || !form.warehouseId) {
      toast({ title: "Kode, nama, dan gudang wajib diisi", variant: "destructive" }); return;
    }
    saveMutation.mutate({ ...form, id: editing?.id });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <LayoutGrid className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Master Rak</h1>
              <p className="text-sm text-muted-foreground">Kelola rak penyimpanan per gudang</p>
            </div>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Tambah Rak
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Label className="text-sm">Filter Gudang:</Label>
          <Select value={filterWh} onValueChange={setFilterWh}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Gudang</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Daftar Rak ({racks.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Rak</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {racks.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-semibold">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.warehouse_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.branch_name}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_active ? "default" : "secondary"}>
                          {r.is_active ? "Aktif" : "Non-aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive"
                            onClick={() => { if (confirm("Hapus rak ini?")) deleteMutation.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {racks.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data rak</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Rak" : "Tambah Rak"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kode Rak *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="A1" />
              </div>
              <div className="space-y-2">
                <Label>Nama Rak *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rak A baris 1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gudang *</Label>
              <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih gudang" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>Rak Aktif</Label>
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
