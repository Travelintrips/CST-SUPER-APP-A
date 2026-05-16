import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Plus, Send, PackageCheck, X } from "lucide-react";

interface Wh { id: number; name: string; branch_name: string; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface TransferLine { product_id: number; product_name: string; sku: string; unit: string; qty_requested: number; qty_sent: number; qty_received: number; }
interface Transfer {
  id: number; transfer_number: string; status: string; note: string | null;
  from_warehouse_name: string; to_warehouse_name: string;
  from_branch_name: string; to_branch_name: string;
  created_at: string; sent_at: string | null; received_at: string | null;
  lines: TransferLine[] | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  in_transit: { label: "Dalam Perjalanan", variant: "default" },
  received: { label: "Diterima", variant: "outline" },
  cancelled: { label: "Dibatalkan", variant: "destructive" },
};

export default function WarehouseTransfersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fromWarehouseId: "", toWarehouseId: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([{ productId: "", qty: "" }]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["wh-warehouses"], queryFn: () => apiFetch("/warehouse/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({ queryKey: ["wh-transfers"], queryFn: () => apiFetch("/warehouse/transfers") });

  const createMutation = useMutation({
    mutationFn: (data: typeof form & { lines: typeof lines }) => apiFetch("/warehouse/transfers", {
      method: "POST", body: JSON.stringify({
        fromWarehouseId: Number(data.fromWarehouseId), toWarehouseId: Number(data.toWarehouseId),
        note: data.note || null,
        lines: data.lines.filter(l => l.productId && l.qty).map(l => ({ productId: Number(l.productId), qtyRequested: Number(l.qty) })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-transfers"] }); toast({ title: "Transfer dibuat" }); setOpen(false); setForm({ fromWarehouseId: "", toWarehouseId: "", note: "" }); setLines([{ productId: "", qty: "" }]); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => apiFetch(`/warehouse/transfers/${id}/action`, { method: "POST", body: JSON.stringify({ action }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-transfers"] }); qc.invalidateQueries({ queryKey: ["wh-stock-summary"] }); toast({ title: "Berhasil" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight size={24} /> Transfer Stok</h1>
            <p className="text-muted-foreground text-sm mt-1">Pindah stok antar gudang</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus size={16} className="mr-1" /> Buat Transfer</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Transfer</TableHead>
                  <TableHead>Dari</TableHead>
                  <TableHead>Ke</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : transfers.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Belum ada transfer</TableCell></TableRow>
                ) : transfers.map(t => {
                  const sc = STATUS_CONFIG[t.status] ?? { label: t.status, variant: "secondary" as const };
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm">{t.transfer_number}</TableCell>
                      <TableCell className="text-sm">{t.from_branch_name} — {t.from_warehouse_name}</TableCell>
                      <TableCell className="text-sm">{t.to_branch_name} — {t.to_warehouse_name}</TableCell>
                      <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                      <TableCell className="text-sm">{t.lines?.length ?? 0} item</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("id-ID")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {t.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: t.id, action: "send" })}>
                              <Send size={12} className="mr-1" /> Kirim
                            </Button>
                          )}
                          {t.status === "in_transit" && (
                            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: t.id, action: "receive" })}>
                              <PackageCheck size={12} className="mr-1" /> Terima
                            </Button>
                          )}
                          {t.status === "draft" && (
                            <Button size="sm" variant="ghost" onClick={() => actionMutation.mutate({ id: t.id, action: "cancel" })}>
                              <X size={12} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Buat Transfer Stok</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Dari Gudang</Label>
                  <Select value={form.fromWarehouseId} onValueChange={v => setForm(f => ({ ...f, fromWarehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                    <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Ke Gudang</Label>
                  <Select value={form.toWarehouseId} onValueChange={v => setForm(f => ({ ...f, toWarehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                    <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Catatan</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." />
              </div>
              <div className="space-y-2">
                <Label>Item yang Dipindah</Label>
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={line.productId} onValueChange={v => setLines(ls => ls.map((l, j) => j === i ? { ...l, productId: v } : l))}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                      <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" className="w-28" placeholder="Qty" value={line.qty} onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, qty: e.target.value } : l))} />
                    {lines.length > 1 && <Button size="sm" variant="ghost" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X size={14} /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setLines(ls => [...ls, { productId: "", qty: "" }])}><Plus size={14} className="mr-1" /> Tambah Item</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={() => createMutation.mutate({ ...form, lines })} disabled={createMutation.isPending || !form.fromWarehouseId || !form.toWarehouseId}>
                {createMutation.isPending ? "Menyimpan..." : "Buat Transfer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
