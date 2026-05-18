import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { RotateCcw, Plus, CheckCircle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface Wh { id: number; warehouse_name: string; branch_name: string | null; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface RetLine { product_id: number; product_name: string; sku: string; unit: string; qty: number; unit_cost: number; note: string | null; }
interface Return {
  id: number; return_number: string; type: string; status: string;
  ref_doc_number: string | null; warehouse_name: string; branch_name: string | null;
  note: string | null; created_at: string; confirmed_at: string | null;
  lines: RetLine[] | null;
}

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const fmtCurr = (n: number) => "Rp " + Number(n).toLocaleString("id-ID");

const TYPE_LABEL: Record<string, string> = { purchase: "Retur Pembelian", sales: "Retur Penjualan" };
const STATUS_CLS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function InventoryReturnsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({ type: "purchase", warehouseId: "", refDocNumber: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string; unitCost: string; note: string }[]>([{ productId: "", qty: "", unitCost: "", note: "" }]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: returns = [], isLoading } = useQuery<Return[]>({ queryKey: ["inv-returns"], queryFn: () => apiFetch("/inventory/returns") });

  const openNew = () => {
    setForm({ type: "purchase", warehouseId: "", refDocNumber: "", note: "" });
    setLines([{ productId: "", qty: "", unitCost: "", note: "" }]);
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/inventory/returns", {
      method: "POST",
      body: JSON.stringify({
        type: form.type,
        warehouseId: Number(form.warehouseId),
        refDocNumber: form.refDocNumber || null,
        note: form.note || null,
        lines: lines.filter(l => l.productId && l.qty).map(l => ({
          productId: Number(l.productId),
          qty: Number(l.qty),
          unitCost: l.unitCost ? Number(l.unitCost) : 0,
          note: l.note || null,
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-returns"] }); toast({ title: "Retur dibuat" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/returns/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-returns"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-detail"] });
      toast({ title: "Retur dikonfirmasi — stok disesuaikan" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const addLine = () => setLines(l => [...l, { productId: "", qty: "", unitCost: "", note: "" }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, j) => j !== i));
  const setLine = (i: number, f: string, v: string) => setLines(l => l.map((item, j) => j === i ? { ...item, [f]: v } : item));

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><RotateCcw size={22} /> Retur Barang</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Retur pembelian (stok keluar) dan retur penjualan (stok masuk kembali)
            </p>
          </div>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Buat Retur</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>No. Retur</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Ref. Dokumen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                : returns.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Belum ada retur</TableCell></TableRow>
                : returns.map(r => (
                  <>
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <TableCell>{expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</TableCell>
                      <TableCell className="font-mono text-xs">{r.return_number}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.type === "purchase" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.warehouse_name}
                        {r.branch_name && <span className="text-muted-foreground text-xs ml-1">({r.branch_name})</span>}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{r.ref_doc_number ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[r.status] ?? ""}`}>
                          {r.status === "draft" ? "Draft" : r.status === "confirmed" ? "Dikonfirmasi" : "Dibatalkan"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        {r.status === "draft" && (
                          <Button size="sm" onClick={() => confirmMutation.mutate(r.id)} disabled={confirmMutation.isPending}>
                            <CheckCircle size={13} className="mr-1" /> Konfirmasi
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded === r.id && r.lines && (
                      <TableRow key={`${r.id}-lines`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground mb-2 font-medium">
                            {r.type === "sales"
                              ? "✓ Retur penjualan: stok akan BERTAMBAH saat dikonfirmasi"
                              : "✓ Retur pembelian: stok akan BERKURANG saat dikonfirmasi"}
                          </p>
                          <table className="w-full text-sm">
                            <thead><tr className="text-muted-foreground text-xs"><th className="text-left pb-1">Produk</th><th className="text-right pb-1">Qty</th><th className="text-right pb-1">HPP</th><th className="text-left pb-1">Catatan</th></tr></thead>
                            <tbody>
                              {r.lines.map((l, i) => (
                                <tr key={i} className="border-t border-border/40">
                                  <td className="py-1">{l.product_name} <span className="text-muted-foreground text-xs">({l.sku})</span></td>
                                  <td className="text-right">{l.qty} {l.unit}</td>
                                  <td className="text-right">{fmtCurr(l.unit_cost)}</td>
                                  <td className="pl-3 text-muted-foreground">{l.note ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {r.note && <p className="text-xs text-muted-foreground mt-2">Catatan: {r.note}</p>}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Buat Retur Barang</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipe Retur *</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">Retur Pembelian (stok keluar)</SelectItem>
                      <SelectItem value="sales">Retur Penjualan (stok masuk)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Gudang *</Label>
                  <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>No. Referensi Dokumen</Label>
                <Input placeholder="SO/2025/001 atau PO/2025/001" value={form.refDocNumber} onChange={e => setForm(f => ({ ...f, refDocNumber: e.target.value }))} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Item Retur *</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus size={13} className="mr-1" /> Tambah</Button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <Select value={line.productId} onValueChange={v => setLine(i, "productId", v)}>
                          <SelectTrigger><SelectValue placeholder="Produk..." /></SelectTrigger>
                          <SelectContent>
                            {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Qty" value={line.qty} onChange={e => setLine(i, "qty", e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" placeholder="HPP" value={line.unitCost} onChange={e => setLine(i, "unitCost", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        {lines.length > 1 && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeLine(i)}><Trash2 size={13} /></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Catatan</Label>
                <Textarea rows={2} placeholder="Keterangan retur..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button disabled={createMutation.isPending || !form.warehouseId} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Membuat..." : "Buat Retur"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
