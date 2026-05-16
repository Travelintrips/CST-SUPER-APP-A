import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, RotateCcw, CheckCircle, Eye, X, Ban } from "lucide-react";

interface Branch { id: number; name: string; }
interface Wh { id: number; name: string; branch_id: number; }
interface InvItem { id: number; name: string; unit: string; sku: string; }
interface ReturnDoc {
  id: number; return_number: string; branch_name: string; warehouse_name: string | null;
  return_type: string; status: string; note: string | null; created_at: string;
}
interface ReturnDetail extends ReturnDoc {
  items: { id: number; item_id: number; item_name: string; unit: string; qty: string; condition: string; note: string | null }[];
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Disetujui", cancelled: "Dibatalkan" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary", approved: "default", cancelled: "destructive",
};
const CONDITION_LABEL: Record<string, string> = { good: "Baik", damaged: "Rusak", expired: "Kadaluarsa" };
const CONDITION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  good: "default", damaged: "destructive", expired: "outline",
};
const TYPE_LABEL: Record<string, string> = { customer: "Customer", outlet: "Outlet" };

export default function PosStockReturnsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState({ branchId: "", warehouseId: "", returnType: "customer", note: "" });
  const [lineItems, setLineItems] = useState<{ itemId: string; qty: string; condition: string; note: string }[]>([]);

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses") });
  const { data: invItems = [] } = useQuery<InvItem[]>({ queryKey: ["pos-inventory-items"], queryFn: () => apiFetch("/pos-inventory/inventory-items") });
  const { data: returns = [], isLoading } = useQuery<ReturnDoc[]>({ queryKey: ["pos-stock-returns"], queryFn: () => apiFetch("/pos-inventory/stock-returns") });
  const { data: detail } = useQuery<ReturnDetail | null>({
    queryKey: ["pos-stock-return-detail", viewId],
    queryFn: () => viewId ? apiFetch(`/pos-inventory/stock-returns/${viewId}`) : null,
    enabled: !!viewId,
  });

  const branchWarehouses = form.branchId ? warehouses.filter(w => w.branch_id === Number(form.branchId)) : [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pos-stock-returns"] });
    qc.invalidateQueries({ queryKey: ["pos-stock-return-detail", viewId] });
  };

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/stock-returns", {
      method: "POST",
      body: JSON.stringify({
        branchId: Number(form.branchId),
        warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
        returnType: form.returnType,
        note: form.note || undefined,
        items: lineItems.filter(l => l.itemId && l.qty).map(l => ({
          itemId: Number(l.itemId), qty: Number(l.qty), condition: l.condition || "good", note: l.note || undefined,
        })),
      }),
    }),
    onSuccess: () => { invalidate(); toast({ title: "Retur dibuat" }); setOpenNew(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/stock-returns/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => { invalidate(); toast({ title: "Retur disetujui – stok diperbarui" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/stock-returns/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => { invalidate(); toast({ title: "Retur dibatalkan" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function addLine() { setLineItems(l => [...l, { itemId: "", qty: "", condition: "good", note: "" }]); }
  function removeLine(idx: number) { setLineItems(l => l.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: string, val: string) {
    setLineItems(l => l.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  function handleCreate() {
    if (!form.branchId) { toast({ title: "Pilih cabang", variant: "destructive" }); return; }
    if (lineItems.filter(l => l.itemId && l.qty).length === 0) { toast({ title: "Tambah minimal 1 item", variant: "destructive" }); return; }
    createMutation.mutate();
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <RotateCcw className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Retur Barang</h1>
              <p className="text-sm text-muted-foreground">Baik → stok masuk · Rusak/Kadaluarsa → karantina</p>
            </div>
          </div>
          <Button onClick={() => { setForm({ branchId: "", warehouseId: "", returnType: "customer", note: "" }); setLineItems([{ itemId: "", qty: "", condition: "good", note: "" }]); setOpenNew(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Buat Retur
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Retur</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.return_number}</TableCell>
                      <TableCell>{r.branch_name}</TableCell>
                      <TableCell><Badge variant="outline">{TYPE_LABEL[r.return_type] ?? r.return_type}</Badge></TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmt(r.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setViewId(r.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {returns.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data retur</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buat Retur Dialog */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Buat Retur Barang</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cabang *</Label>
                <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v, warehouseId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gudang</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Opsional" /></SelectTrigger>
                  <SelectContent>{branchWarehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipe Retur</Label>
                <Select value={form.returnType} onValueChange={v => setForm(f => ({ ...f, returnType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="outlet">Outlet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Item Retur</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Tambah
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lineItems.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Select value={line.itemId} onValueChange={v => updateLine(i, "itemId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Item" /></SelectTrigger>
                        <SelectContent>{invItems.map(it => <SelectItem key={it.id} value={String(it.id)}>{it.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs" type="number" value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} placeholder="Qty" />
                    </div>
                    <div className="col-span-3">
                      <Select value={line.condition} onValueChange={v => updateLine(i, "condition", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Kondisi" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Baik</SelectItem>
                          <SelectItem value="damaged">Rusak</SelectItem>
                          <SelectItem value="expired">Kadaluarsa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <div className="flex gap-1">
                        <Input className="h-8 text-xs flex-1" value={line.note} onChange={e => updateLine(i, "note", e.target.value)} placeholder="Catatan" />
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeLine(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? "Menyimpan..." : "Buat Retur"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!viewId} onOpenChange={v => { if (!v) setViewId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detail Retur — {detail?.return_number}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Cabang:</span> <span className="font-medium ml-1">{detail.branch_name}</span></div>
                <div><span className="text-muted-foreground">Gudang:</span> <span className="ml-1">{detail.warehouse_name ?? "-"}</span></div>
                <div><span className="text-muted-foreground">Tipe:</span> <Badge variant="outline" className="ml-2">{TYPE_LABEL[detail.return_type] ?? detail.return_type}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className="ml-2" variant={STATUS_VARIANT[detail.status] ?? "secondary"}>{STATUS_LABEL[detail.status] ?? detail.status}</Badge></div>
                {detail.note && <div className="col-span-2"><span className="text-muted-foreground">Catatan:</span> <span className="ml-1">{detail.note}</span></div>}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Kondisi</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{it.item_name}</TableCell>
                      <TableCell className="text-right">{Number(it.qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })} {it.unit}</TableCell>
                      <TableCell><Badge variant={CONDITION_VARIANT[it.condition] ?? "secondary"}>{CONDITION_LABEL[it.condition] ?? it.condition}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{it.note ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {detail.status === "draft" && (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 gap-2" onClick={() => { if (confirm("Setujui retur? Stok baik akan masuk, rusak/expired ke karantina.")) approveMutation.mutate(detail.id); }} disabled={approveMutation.isPending}>
                    <CheckCircle className="h-4 w-4" /> Setujui Retur
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => { if (confirm("Batalkan retur ini?")) cancelMutation.mutate(detail.id); }} disabled={cancelMutation.isPending}>
                    <Ban className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {detail.status === "approved" && (
                <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg">
                  Retur sudah diproses. Item kondisi baik masuk ke stok, rusak/kadaluarsa masuk ke karantina.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
