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
import { Plus, AlertTriangle } from "lucide-react";

interface Branch { id: number; name: string; }
interface Wh { id: number; name: string; branch_id: number; }
interface InvItem { id: number; name: string; unit: string; sku: string; }
interface Loss {
  id: number; loss_number: string; branch_name: string; warehouse_name: string | null;
  item_name: string; unit: string; qty: string; loss_type: string; reason: string; created_at: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const LOSS_TYPE_LABEL: Record<string, string> = { damaged: "Rusak", lost: "Hilang", expired: "Kadaluarsa" };
const LOSS_TYPE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  damaged: "destructive", lost: "secondary", expired: "outline",
};

export default function PosStockLossesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [filterBranch, setFilterBranch] = useState("all");
  const [form, setForm] = useState({ branchId: "", warehouseId: "", itemId: "", qty: "", lossType: "damaged", reason: "" });

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses") });
  const { data: invItems = [] } = useQuery<InvItem[]>({ queryKey: ["pos-inventory-items"], queryFn: () => apiFetch("/pos-inventory/inventory-items") });
  const { data: losses = [], isLoading } = useQuery<Loss[]>({
    queryKey: ["pos-stock-losses", filterBranch],
    queryFn: () => apiFetch(`/pos-inventory/stock-losses${filterBranch !== "all" ? `?branchId=${filterBranch}` : ""}`),
  });

  const branchWarehouses = form.branchId ? warehouses.filter(w => w.branch_id === Number(form.branchId)) : [];

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/stock-losses", {
      method: "POST",
      body: JSON.stringify({
        branchId: Number(form.branchId),
        warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
        itemId: Number(form.itemId),
        qty: Number(form.qty),
        lossType: form.lossType,
        reason: form.reason,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-stock-losses"] });
      qc.invalidateQueries({ queryKey: ["pos-inventory-stocks"] });
      toast({ title: "Kerugian stok dicatat – stok berkurang" });
      setOpenNew(false);
      setForm({ branchId: "", warehouseId: "", itemId: "", qty: "", lossType: "damaged", reason: "" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function handleCreate() {
    if (!form.branchId || !form.itemId || !form.qty || !form.reason.trim()) {
      toast({ title: "Cabang, item, qty, dan alasan wajib diisi", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Barang Rusak / Hilang</h1>
              <p className="text-sm text-muted-foreground">Catat kerugian stok — rusak, hilang, atau kadaluarsa</p>
            </div>
          </div>
          <Button variant="destructive" onClick={() => setOpenNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Catat Kerugian
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Label className="shrink-0">Filter Cabang:</Label>
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Cabang</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Catatan</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {losses.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.loss_number}</TableCell>
                      <TableCell className="text-sm">{l.branch_name}</TableCell>
                      <TableCell className="font-medium">{l.item_name}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">
                        -{Number(l.qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })} {l.unit}
                      </TableCell>
                      <TableCell><Badge variant={LOSS_TYPE_VARIANT[l.loss_type] ?? "secondary"}>{LOSS_TYPE_LABEL[l.loss_type] ?? l.loss_type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{l.reason}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmt(l.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {losses.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada catatan kerugian stok</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Catat Kerugian Dialog */}
      <Dialog open={openNew} onOpenChange={v => { if (!v) setOpenNew(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Catat Barang Rusak / Hilang</DialogTitle></DialogHeader>
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
            </div>

            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={form.itemId} onValueChange={v => setForm(f => ({ ...f, itemId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih item" /></SelectTrigger>
                <SelectContent>{invItems.map(it => <SelectItem key={it.id} value={String(it.id)}>{it.name} ({it.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Qty *</Label>
                <Input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="0" min="0" step="0.001" />
              </div>
              <div className="space-y-2">
                <Label>Jenis Kerugian *</Label>
                <Select value={form.lossType} onValueChange={v => setForm(f => ({ ...f, lossType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damaged">Rusak</SelectItem>
                    <SelectItem value="lost">Hilang</SelectItem>
                    <SelectItem value="expired">Kadaluarsa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Alasan *</Label>
              <Textarea
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Jelaskan penyebab kerugian stok ini..."
                rows={3}
              />
            </div>

            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              Stok item akan <strong>berkurang</strong> sejumlah qty yang diinput dan tercatat di mutasi stok.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Menyimpan..." : "Catat Kerugian"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
