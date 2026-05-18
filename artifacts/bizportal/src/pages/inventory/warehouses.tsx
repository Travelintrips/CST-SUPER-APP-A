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
import { Warehouse, Plus, Pencil } from "lucide-react";

interface Branch { id: number; name: string; code: string; }
interface Wh {
  id: number; warehouse_code: string; warehouse_name: string;
  warehouse_type: string; branch_id: number | null; address: string | null;
  is_active: boolean; branch_name: string | null; branch_code: string | null;
}

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const TYPE_LABEL: Record<string, string> = { CENTRAL: "Pusat", BRANCH: "Cabang", OUTLET: "Outlet" };

export default function InventoryWarehousesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Wh | null>(null);
  const [form, setForm] = useState({ warehouseCode: "", warehouseName: "", warehouseType: "BRANCH", branchId: "", address: "" });

  const { data: warehouses = [], isLoading } = useQuery<Wh[]>({
    queryKey: ["inv-warehouses"],
    queryFn: () => apiFetch("/inventory/warehouses"),
  });
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["inv-branches"],
    queryFn: () => apiFetch("/inventory/branches"),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ warehouseCode: "", warehouseName: "", warehouseType: "BRANCH", branchId: "", address: "" });
    setOpen(true);
  };

  const openEdit = (w: Wh) => {
    setEditing(w);
    setForm({ warehouseCode: w.warehouse_code, warehouseName: w.warehouse_name, warehouseType: w.warehouse_type, branchId: String(w.branch_id ?? ""), address: w.address ?? "" });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => {
      const body = { ...data, branchId: data.branchId ? Number(data.branchId) : null };
      if (editing) return apiFetch(`/inventory/warehouses/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      return apiFetch("/inventory/warehouses", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-warehouses"] }); toast({ title: editing ? "Gudang diperbarui" : "Gudang ditambahkan" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: (w: Wh) => apiFetch(`/inventory/warehouses/${w.id}`, { method: "PUT", body: JSON.stringify({ isActive: !w.is_active }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-warehouses"] }); toast({ title: "Status diperbarui" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Warehouse size={22} /> Gudang</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola gudang per cabang dan lokasi</p>
          </div>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Tambah Gudang</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama Gudang</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : warehouses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada gudang</TableCell></TableRow>
                ) : warehouses.map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs">{w.warehouse_code}</TableCell>
                    <TableCell className="font-medium">{w.warehouse_name}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABEL[w.warehouse_type] ?? w.warehouse_type}</Badge></TableCell>
                    <TableCell className="text-sm">{w.branch_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{w.address ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className="cursor-pointer select-none"
                        variant={w.is_active ? "outline" : "secondary"}
                        onClick={() => toggleActive.mutate(w)}
                      >
                        {w.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(w)}><Pencil size={14} /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Gudang" : "Tambah Gudang"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kode Gudang *</Label>
                  <Input placeholder="GDG-01" value={form.warehouseCode} onChange={e => setForm(f => ({ ...f, warehouseCode: e.target.value }))} disabled={!!editing} />
                </div>
                <div>
                  <Label>Tipe *</Label>
                  <Select value={form.warehouseType} onValueChange={v => setForm(f => ({ ...f, warehouseType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CENTRAL">Pusat</SelectItem>
                      <SelectItem value="BRANCH">Cabang</SelectItem>
                      <SelectItem value="OUTLET">Outlet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Nama Gudang *</Label>
                <Input placeholder="Gudang Utama Jakarta" value={form.warehouseName} onChange={e => setForm(f => ({ ...f, warehouseName: e.target.value }))} />
              </div>
              <div>
                <Label>Cabang</Label>
                <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih cabang..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Tanpa cabang —</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alamat</Label>
                <Input placeholder="Jl. Gudang No. 1" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
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
