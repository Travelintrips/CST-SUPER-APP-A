import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LayoutGrid, Plus, Pencil, Trash2 } from "lucide-react";

interface Wh { id: number; warehouse_name: string; warehouse_code: string; branch_name: string | null; }
interface Rack {
  id: number; warehouse_id: number; rack_code: string; rack_name: string;
  zone: string | null; qr_code: string | null; is_active: boolean;
  warehouse_name: string; branch_name: string | null;
}

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export default function InventoryRacksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rack | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [form, setForm] = useState({ warehouseId: "", rackCode: "", rackName: "", zone: "" });

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: racks = [], isLoading } = useQuery<Rack[]>({
    queryKey: ["inv-racks", warehouseFilter],
    queryFn: () => apiFetch(`/inventory/racks${warehouseFilter !== "all" ? `?warehouseId=${warehouseFilter}` : ""}`),
  });

  const openNew = () => { setEditing(null); setForm({ warehouseId: "", rackCode: "", rackName: "", zone: "" }); setOpen(true); };
  const openEdit = (r: Rack) => { setEditing(r); setForm({ warehouseId: String(r.warehouse_id), rackCode: r.rack_code, rackName: r.rack_name, zone: r.zone ?? "" }); setOpen(true); };

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => {
      if (editing) return apiFetch(`/inventory/racks/${editing.id}`, { method: "PUT", body: JSON.stringify({ rackName: data.rackName, zone: data.zone || null }) });
      return apiFetch("/inventory/racks", { method: "POST", body: JSON.stringify({ warehouseId: Number(data.warehouseId), rackCode: data.rackCode, rackName: data.rackName, zone: data.zone || null }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-racks"] }); toast({ title: editing ? "Rak diperbarui" : "Rak ditambahkan" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/racks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-racks"] }); toast({ title: "Rak dinonaktifkan" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutGrid size={22} /> Rak</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola rak/lokasi penyimpanan di dalam gudang</p>
          </div>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Tambah Rak</Button>
        </div>

        <div className="flex gap-3">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Semua Gudang" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Gudang</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode Rak</TableHead>
                  <TableHead>Nama Rak</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : racks.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada rak</TableCell></TableRow>
                ) : racks.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.rack_code}</TableCell>
                    <TableCell className="font-medium">{r.rack_name}</TableCell>
                    <TableCell className="text-sm">{r.zone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.warehouse_name}</TableCell>
                    <TableCell className="text-sm">{r.branch_name ?? "—"}</TableCell>
                    <TableCell><Badge variant={r.is_active ? "outline" : "secondary"}>{r.is_active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(r.id)}><Trash2 size={14} /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editing ? "Edit Rak" : "Tambah Rak"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {!editing && (
                <div>
                  <Label>Gudang *</Label>
                  <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!editing && (
                <div>
                  <Label>Kode Rak *</Label>
                  <Input placeholder="A-01" value={form.rackCode} onChange={e => setForm(f => ({ ...f, rackCode: e.target.value }))} />
                </div>
              )}
              <div>
                <Label>Nama Rak *</Label>
                <Input placeholder="Rak A Baris 1" value={form.rackName} onChange={e => setForm(f => ({ ...f, rackName: e.target.value }))} />
              </div>
              <div>
                <Label>Zona</Label>
                <Input placeholder="Zona A" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
                {saveMutation.isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
