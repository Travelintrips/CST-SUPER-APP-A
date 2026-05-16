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
import { RotateCcw, Plus, CheckCircle, X } from "lucide-react";

interface Wh { id: number; name: string; branch_name: string; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface ReturnLine { product_name: string; sku: string; unit: string; qty: number; unit_cost: number; }
interface ReturnDoc {
  id: number; return_number: string; type: string; status: string;
  ref_doc_number: string | null; warehouse_name: string;
  note: string | null; created_at: string; confirmed_at: string | null;
  lines: ReturnLine[] | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmtCurr = (n: number) => "Rp " + Number(n).toLocaleString("id-ID");

export default function WarehouseReturnsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "purchase" as "purchase" | "sales", warehouseId: "", refDocNumber: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string; unitCost: string; note: string }[]>([
    { productId: "", qty: "", unitCost: "", note: "" }
  ]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["wh-warehouses"], queryFn: () => apiFetch("/warehouse/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: returns = [], isLoading } = useQuery<ReturnDoc[]>({ queryKey: ["wh-returns"], queryFn: () => apiFetch("/warehouse/returns") });

  const createMutation = useMutation({
    mutationFn: (data: typeof form & { lines: typeof lines }) => apiFetch("/warehouse/returns", {
      method: "POST", body: JSON.stringify({
        type: data.type, warehouseId: Number(data.warehouseId),
        refDocNumber: data.refDocNumber || null, note: data.note || null,
        lines: data.lines.filter(l => l.productId && l.qty).map(l => ({
          productId: Number(l.productId), qty: Number(l.qty),
          unitCost: Number(l.unitCost) || 0, note: l.note || null,
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-returns"] }); toast({ title: "Retur dibuat" }); setOpen(false); setForm({ type: "purchase", warehouseId: "", refDocNumber: "", note: "" }); setLines([{ productId: "", qty: "", unitCost: "", note: "" }]); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/warehouse/returns/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-returns"] }); qc.invalidateQueries({ queryKey: ["wh-stock-summary"] }); toast({ title: "Retur dikonfirmasi, stok diperbarui" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><RotateCcw size={24} /> Retur Barang</h1>
            <p className="text-muted-foreground text-sm mt-1">Retur ke supplier (purchase return) dan retur dari customer (sales return)</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus size={16} className="mr-1" /> Buat Retur</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Retur</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Ref. Dokumen</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : returns.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Belum ada retur</TableCell></TableRow>
                ) : returns.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.return_number}</TableCell>
                    <TableCell>
                      <Badge variant={r.type === "purchase" ? "outline" : "secondary"}>
                        {r.type === "purchase" ? "Retur ke Supplier" : "Retur dari Customer"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.warehouse_name}</TableCell>
                    <TableCell className="text-sm font-mono">{r.ref_doc_number ?? "-"}</TableCell>
                    <TableCell>
                      {r.lines?.map((l, i) => (
                        <div key={i} className="text-xs">{l.product_name} ×{l.qty} {l.unit} — {fmtCurr(l.unit_cost)}</div>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "confirmed" ? "outline" : r.status === "cancelled" ? "destructive" : "secondary"}>
                        {r.status === "confirmed" ? "Dikonfirmasi" : r.status === "cancelled" ? "Dibatalkan" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("id-ID")}</TableCell>
                    <TableCell>
                      {r.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => confirmMutation.mutate(r.id)} disabled={confirmMutation.isPending}>
                          <CheckCircle size={12} className="mr-1" /> Konfirmasi
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Buat Retur Barang</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Tipe Retur</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as "purchase" | "sales" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Retur ke Supplier (Purchase)</SelectItem>
                      <SelectItem value="sales">Retur dari Customer (Sales)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Gudang</Label>
                  <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                    <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>No. Dokumen Asal (opsional)</Label>
                  <Input value={form.refDocNumber} onChange={e => setForm(f => ({ ...f, refDocNumber: e.target.value }))} placeholder="PO/2025/00001" />
                </div>
                <div className="space-y-1">
                  <Label>Catatan</Label>
                  <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Daftar Barang</Label>
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_100px_1fr_24px] gap-2 items-center">
                    <Select value={line.productId} onValueChange={v => setLines(ls => ls.map((l, j) => j === i ? { ...l, productId: v } : l))}>
                      <SelectTrigger><SelectValue placeholder="Produk..." /></SelectTrigger>
                      <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Qty" value={line.qty} onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, qty: e.target.value } : l))} />
                    <Input type="number" placeholder="HPP/unit" value={line.unitCost} onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, unitCost: e.target.value } : l))} />
                    <Input placeholder="Catatan..." value={line.note} onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, note: e.target.value } : l))} />
                    {lines.length > 1 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X size={12} /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setLines(ls => [...ls, { productId: "", qty: "", unitCost: "", note: "" }])}><Plus size={14} className="mr-1" /> Tambah</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={() => createMutation.mutate({ ...form, lines })} disabled={createMutation.isPending || !form.warehouseId}>
                {createMutation.isPending ? "Menyimpan..." : "Buat Retur"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
