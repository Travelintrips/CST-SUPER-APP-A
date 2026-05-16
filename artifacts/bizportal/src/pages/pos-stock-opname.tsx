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
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardCheck, Eye, CheckCircle } from "lucide-react";

interface Branch { id: number; name: string; }
interface Wh { id: number; name: string; branch_id: number; }
interface Opname {
  id: number; opname_number: string; branch_name: string; warehouse_name: string | null;
  status: string; note: string | null; created_at: string; confirmed_at: string | null;
}
interface OpnameItem { item_id: number; item_name: string; unit: string; system_qty: string; actual_qty: string; diff_qty: string; note: string | null; }
interface OpnameDetail extends Opname { items: OpnameItem[]; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function PosStockOpnamePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState({ branchId: "", warehouseId: "", note: "" });
  const [editItems, setEditItems] = useState<{ itemId: number; actualQty: string; note: string }[]>([]);

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses") });
  const { data: opnames = [], isLoading } = useQuery<Opname[]>({ queryKey: ["pos-stock-opnames"], queryFn: () => apiFetch("/pos-inventory/stock-opnames") });
  const { data: detail } = useQuery<OpnameDetail | null>({
    queryKey: ["pos-stock-opname-detail", viewId],
    queryFn: async () => {
      if (!viewId) return null;
      const d: OpnameDetail = await apiFetch(`/pos-inventory/stock-opnames/${viewId}`);
      if (d) setEditItems(d.items.map(i => ({ itemId: i.item_id, actualQty: String(i.actual_qty), note: i.note ?? "" })));
      return d;
    },
    enabled: !!viewId,
  });

  const filteredWarehouses = form.branchId ? warehouses.filter(w => w.branch_id === Number(form.branchId)) : [];

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/stock-opnames", {
      method: "POST",
      body: JSON.stringify({ branchId: Number(form.branchId), warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined, note: form.note || undefined }),
    }),
    onSuccess: (data: Opname) => {
      qc.invalidateQueries({ queryKey: ["pos-stock-opnames"] });
      toast({ title: "Opname dibuat, klik untuk mengisi data aktual" });
      setOpenNew(false);
      setViewId(data.id);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const saveItemsMutation = useMutation({
    mutationFn: () => apiFetch(`/pos-inventory/stock-opnames/${viewId}/items`, {
      method: "PUT",
      body: JSON.stringify({ items: editItems.map(i => ({ itemId: i.itemId, actualQty: Number(i.actualQty), note: i.note || undefined })) }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-stock-opname-detail", viewId] }); toast({ title: "Data aktual disimpan" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiFetch(`/pos-inventory/stock-opnames/${viewId}/confirm`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-stock-opnames"] });
      qc.invalidateQueries({ queryKey: ["pos-stock-opname-detail", viewId] });
      qc.invalidateQueries({ queryKey: ["pos-inventory-stocks"] });
      toast({ title: "Opname dikonfirmasi, stok telah disesuaikan" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function updateActualQty(itemId: number, val: string) {
    setEditItems(prev => prev.map(i => i.itemId === itemId ? { ...i, actualQty: val } : i));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stock Opname</h1>
              <p className="text-sm text-muted-foreground">Hitung stok fisik dan sesuaikan dengan sistem</p>
            </div>
          </div>
          <Button onClick={() => { setForm({ branchId: "", warehouseId: "", note: "" }); setOpenNew(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Buat Opname
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Opname</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opnames.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.opname_number}</TableCell>
                      <TableCell>{o.branch_name}</TableCell>
                      <TableCell className="text-muted-foreground">{o.warehouse_name ?? "Semua Gudang"}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === "confirmed" ? "default" : "secondary"}>
                          {o.status === "confirmed" ? "Dikonfirmasi" : "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmtDate(o.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setViewId(o.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {opnames.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data opname</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buat Opname */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Buat Stock Opname</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cabang *</Label>
              <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v, warehouseId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
                <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gudang (opsional)</Label>
              <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Semua gudang" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua Gudang</SelectItem>
                  {filteredWarehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
            </div>
            <p className="text-xs text-muted-foreground">Sistem akan otomatis mengambil semua item stok dari cabang/gudang terpilih.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Batal</Button>
            <Button onClick={() => { if (!form.branchId) { toast({ title: "Pilih cabang", variant: "destructive" }); return; } createMutation.mutate(); }} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Membuat..." : "Buat Opname"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Opname */}
      <Dialog open={!!viewId} onOpenChange={v => { if (!v) setViewId(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detail Opname — {detail?.opname_number}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div><span className="text-muted-foreground">Cabang:</span> <span className="font-medium ml-1">{detail.branch_name}</span></div>
                <div><span className="text-muted-foreground">Gudang:</span> <span className="font-medium ml-1">{detail.warehouse_name ?? "Semua"}</span></div>
                <Badge variant={detail.status === "confirmed" ? "default" : "secondary"} className="ml-auto">
                  {detail.status === "confirmed" ? "Dikonfirmasi" : "Draft"}
                </Badge>
              </div>

              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Stok Sistem</TableHead>
                      <TableHead className="text-right">Stok Aktual</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.status === "draft" ? editItems.map(ei => {
                      const orig = detail.items.find(di => di.item_id === ei.itemId);
                      return orig ? { ...orig, actual_qty: ei.actualQty } : null;
                    }).filter(Boolean) : detail.items).map((item) => {
                      const i = item as OpnameItem & { actual_qty: string };
                      const diff = Number(i.actual_qty) - Number(i.system_qty);
                      return (
                        <TableRow key={i.item_id}>
                          <TableCell>{i.item_name} <span className="text-xs text-muted-foreground">({i.unit})</span></TableCell>
                          <TableCell className="text-right">{fmt(i.system_qty)}</TableCell>
                          <TableCell className="text-right">
                            {detail.status === "draft" ? (
                              <Input type="number" className="w-24 h-7 text-xs text-right ml-auto"
                                value={editItems.find(ei => ei.itemId === i.item_id)?.actualQty ?? ""}
                                onChange={e => updateActualQty(i.item_id, e.target.value)} />
                            ) : fmt(i.actual_qty)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${diff < 0 ? "text-red-400" : diff > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                            {detail.status === "draft" ? (
                              <span>{Number((editItems.find(ei => ei.itemId === i.item_id)?.actualQty ?? 0)) - Number(i.system_qty) > 0 ? "+" : ""}{fmt(Number((editItems.find(ei => ei.itemId === i.item_id)?.actualQty ?? 0)) - Number(i.system_qty))}</span>
                            ) : (
                              <span>{Number(i.diff_qty) >= 0 ? "+" : ""}{fmt(i.diff_qty)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {detail.items.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Tidak ada item stok untuk cabang/gudang ini</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {detail.status === "draft" && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => saveItemsMutation.mutate()} disabled={saveItemsMutation.isPending}>
                    {saveItemsMutation.isPending ? "Menyimpan..." : "Simpan Data Aktual"}
                  </Button>
                  <Button className="flex-1 gap-2" onClick={() => { if (confirm("Konfirmasi opname? Stok akan disesuaikan sesuai data aktual.")) confirmMutation.mutate(); }} disabled={confirmMutation.isPending}>
                    <CheckCircle className="h-4 w-4" /> {confirmMutation.isPending ? "Mengkonfirmasi..." : "Konfirmasi & Sesuaikan Stok"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
