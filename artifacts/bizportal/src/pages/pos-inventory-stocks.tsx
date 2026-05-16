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
import { Plus, Boxes, AlertTriangle } from "lucide-react";

interface Branch { id: number; name: string; }
interface Wh { id: number; name: string; branch_id: number; branch_name: string; }
interface InvItem { id: number; name: string; sku: string; unit: string; }
interface Stock {
  id: number; item_id: number; item_name: string; sku: string; unit: string; min_stock: string;
  branch_id: number; branch_name: string; warehouse_name: string | null; rack_name: string | null; qty: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

export default function PosInventoryStocksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [form, setForm] = useState({ itemId: "", branchId: "", warehouseId: "", qty: "", note: "", type: "in" });

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses") });
  const { data: invItems = [] } = useQuery<InvItem[]>({ queryKey: ["pos-inventory-items"], queryFn: () => apiFetch("/pos-inventory/inventory-items") });

  const { data: stocks = [], isLoading } = useQuery<Stock[]>({
    queryKey: ["pos-inventory-stocks", filterBranch],
    queryFn: () => apiFetch(`/pos-inventory/inventory-stocks${filterBranch !== "all" ? `?branchId=${filterBranch}` : ""}`),
  });

  const filteredWarehouses = form.branchId ? warehouses.filter(w => w.branch_id === Number(form.branchId)) : warehouses;

  const adjustMutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/pos-inventory/inventory-stocks/adjust", {
      method: "POST",
      body: JSON.stringify({
        itemId: Number(data.itemId),
        branchId: Number(data.branchId),
        warehouseId: data.warehouseId ? Number(data.warehouseId) : undefined,
        qty: data.type === "out" ? -Number(data.qty) : Number(data.qty),
        note: data.note,
        type: data.type,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-inventory-stocks"] }); toast({ title: "Stok diperbarui" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function handleSave() {
    if (!form.itemId || !form.branchId || !form.qty) {
      toast({ title: "Item, cabang, dan qty wajib diisi", variant: "destructive" }); return;
    }
    adjustMutation.mutate(form);
  }

  const lowStockCount = stocks.filter(s => Number(s.qty) <= Number(s.min_stock)).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Boxes className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stok Inventory</h1>
              <p className="text-sm text-muted-foreground">Pantau stok bahan baku per cabang & gudang</p>
            </div>
          </div>
          <Button onClick={() => { setForm({ itemId: "", branchId: "", warehouseId: "", qty: "", note: "", type: "in" }); setOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Penyesuaian Stok
          </Button>
        </div>

        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-orange-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{lowStockCount} item mencapai atau di bawah stok minimum</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Label className="text-sm">Filter Cabang:</Label>
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Cabang</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Posisi Stok ({stocks.length} baris)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bahan Baku</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Rak</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Min Stok</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocks.map(s => {
                    const isLow = Number(s.qty) <= Number(s.min_stock);
                    return (
                      <TableRow key={s.id} className={isLow ? "bg-orange-500/5" : ""}>
                        <TableCell className="font-medium">{s.item_name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.sku}</TableCell>
                        <TableCell className="text-muted-foreground">{s.branch_name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.warehouse_name ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{s.rack_name ?? "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(s.qty)} {s.unit}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmt(s.min_stock)}</TableCell>
                        <TableCell>
                          {isLow ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> Rendah
                            </Badge>
                          ) : (
                            <Badge variant="default">Normal</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {stocks.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Belum ada data stok</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Penyesuaian Stok</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bahan Baku *</Label>
              <Select value={form.itemId} onValueChange={v => setForm(f => ({ ...f, itemId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih bahan baku" /></SelectTrigger>
                <SelectContent>
                  {invItems.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.sku})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cabang *</Label>
              <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v, warehouseId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gudang</Label>
              <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih gudang (opsional)" /></SelectTrigger>
                <SelectContent>
                  {filteredWarehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipe</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Masuk (+)</SelectItem>
                    <SelectItem value="out">Keluar (-)</SelectItem>
                    <SelectItem value="adjustment">Penyesuaian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jumlah *</Label>
                <Input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Keterangan opsional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={adjustMutation.isPending}>{adjustMutation.isPending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
