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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Plus, Send, PackageCheck, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface Wh { id: number; warehouse_name: string; warehouse_code: string; branch_name: string | null; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface TLine { product_id: number; product_name: string; sku: string; unit: string; qty_requested: number; qty_sent: number; qty_received: number; }
interface Transfer {
  id: number; transfer_number: string; status: string; note: string | null;
  from_warehouse_name: string; to_warehouse_name: string;
  from_branch_name: string | null; to_branch_name: string | null;
  created_at: string; sent_at: string | null; received_at: string | null;
  lines: TLine[] | null;
}

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  in_transit: { label: "Dalam Perjalanan", cls: "bg-blue-100 text-blue-700" },
  received: { label: "Diterima", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Dibatalkan", cls: "bg-red-100 text-red-700" },
};

export default function InventoryTransfersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({ fromWarehouseId: "", toWarehouseId: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([{ productId: "", qty: "" }]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({ queryKey: ["inv-transfers"], queryFn: () => apiFetch("/inventory/transfers") });

  const openNew = () => {
    setForm({ fromWarehouseId: "", toWarehouseId: "", note: "" });
    setLines([{ productId: "", qty: "" }]);
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/inventory/transfers", {
      method: "POST",
      body: JSON.stringify({
        fromWarehouseId: Number(form.fromWarehouseId),
        toWarehouseId: Number(form.toWarehouseId),
        note: form.note || null,
        lines: lines.filter(l => l.productId && l.qty).map(l => ({ productId: Number(l.productId), qtyRequested: Number(l.qty) })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-transfers"] }); toast({ title: "Transfer dibuat" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiFetch(`/inventory/transfers/${id}/action`, { method: "POST", body: JSON.stringify({ action }) }),
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ["inv-transfers"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-detail"] });
      const msg: Record<string, string> = { send: "Transfer dikirim — stok asal berkurang", receive: "Transfer diterima — stok tujuan bertambah", cancel: "Transfer dibatalkan" };
      toast({ title: msg[action] ?? "Berhasil" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const addLine = () => setLines(l => [...l, { productId: "", qty: "" }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, j) => j !== i));
  const setLine = (i: number, field: string, val: string) => setLines(l => l.map((item, j) => j === i ? { ...item, [field]: val } : item));

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight size={22} /> Transfer Stok</h1>
            <p className="text-sm text-muted-foreground mt-1">Pindahkan stok antar gudang — asal dikurangi, tujuan ditambah</p>
          </div>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Buat Transfer</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>No. Transfer</TableHead>
                  <TableHead>Dari</TableHead>
                  <TableHead>Ke</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                : transfers.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada transfer</TableCell></TableRow>
                : transfers.map(t => (
                  <>
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                      <TableCell>{expanded === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</TableCell>
                      <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{t.from_warehouse_name}</span>
                        {t.from_branch_name && <span className="text-muted-foreground ml-1 text-xs">({t.from_branch_name})</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{t.to_warehouse_name}</span>
                        {t.to_branch_name && <span className="text-muted-foreground ml-1 text-xs">({t.to_branch_name})</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[t.status]?.cls ?? ""}`}>
                          {STATUS[t.status]?.label ?? t.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(t.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          {t.status === "draft" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: t.id, action: "send" })} disabled={actionMutation.isPending}>
                                <Send size={13} className="mr-1" /> Kirim
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => actionMutation.mutate({ id: t.id, action: "cancel" })} disabled={actionMutation.isPending}>
                                <X size={13} />
                              </Button>
                            </>
                          )}
                          {t.status === "in_transit" && (
                            <Button size="sm" onClick={() => actionMutation.mutate({ id: t.id, action: "receive" })} disabled={actionMutation.isPending}>
                              <PackageCheck size={13} className="mr-1" /> Terima
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded === t.id && t.lines && (
                      <TableRow key={`${t.id}-lines`}>
                        <TableCell colSpan={7} className="bg-muted/30 p-3">
                          <table className="w-full text-sm">
                            <thead><tr className="text-muted-foreground text-xs"><th className="text-left pb-1">Produk</th><th className="text-right pb-1">Diminta</th><th className="text-right pb-1">Dikirim</th><th className="text-right pb-1">Diterima</th></tr></thead>
                            <tbody>
                              {t.lines.map((l, i) => (
                                <tr key={i} className="border-t border-border/40">
                                  <td className="py-1">{l.product_name} <span className="text-muted-foreground text-xs">({l.sku})</span></td>
                                  <td className="text-right">{l.qty_requested} {l.unit}</td>
                                  <td className="text-right">{l.qty_sent ?? 0} {l.unit}</td>
                                  <td className="text-right">{l.qty_received ?? 0} {l.unit}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {t.note && <p className="text-xs text-muted-foreground mt-2">Catatan: {t.note}</p>}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Form Buat Transfer */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Buat Transfer Stok</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gudang Asal *</Label>
                  <Select value={form.fromWarehouseId} onValueChange={v => setForm(f => ({ ...f, fromWarehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)} disabled={String(w.id) === form.toWarehouseId}>
                        {w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}
                      </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Gudang Tujuan *</Label>
                  <Select value={form.toWarehouseId} onValueChange={v => setForm(f => ({ ...f, toWarehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)} disabled={String(w.id) === form.fromWarehouseId}>
                        {w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}
                      </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Item Transfer *</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus size={13} className="mr-1" /> Tambah Item</Button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Select value={line.productId} onValueChange={v => setLine(i, "productId", v)}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="Qty" className="w-24" value={line.qty} onChange={e => setLine(i, "qty", e.target.value)} />
                      {lines.length > 1 && <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => removeLine(i)}><Trash2 size={13} /></Button>}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Catatan</Label>
                <Textarea rows={2} placeholder="Keterangan transfer..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button disabled={createMutation.isPending || !form.fromWarehouseId || !form.toWarehouseId} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Membuat..." : "Buat Transfer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
