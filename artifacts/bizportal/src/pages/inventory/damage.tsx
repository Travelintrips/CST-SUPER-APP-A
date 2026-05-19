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
import { AlertTriangle, Plus, CheckCircle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface Wh { id: number; warehouse_name: string; branch_name: string | null; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface DmgLine { product_id: number; product_name: string; sku: string; unit: string; qty: number; damage_type: string; note: string | null; }
interface DamageReport {
  id: number; report_number: string; status: string;
  warehouse_name: string; branch_name: string | null;
  note: string | null; created_at: string; confirmed_at: string | null;
  lines: DmgLine[] | null;
}

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

const DAMAGE_TYPES = [
  { value: "rusak", label: "Rusak" },
  { value: "hilang", label: "Hilang" },
  { value: "expired", label: "Kadaluarsa" },
  { value: "lainnya", label: "Lainnya" },
];

const STATUS_CLS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  confirmed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function InventoryDamagePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({ warehouseId: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string; damageType: string; note: string }[]>([{ productId: "", qty: "", damageType: "rusak", note: "" }]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: reports = [], isLoading } = useQuery<DamageReport[]>({ queryKey: ["inv-damage"], queryFn: () => apiFetch("/inventory/damage") });

  const openNew = () => {
    setForm({ warehouseId: "", note: "" });
    setLines([{ productId: "", qty: "", damageType: "rusak", note: "" }]);
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/inventory/damage", {
      method: "POST",
      body: JSON.stringify({
        warehouseId: Number(form.warehouseId),
        note: form.note || null,
        lines: lines.filter(l => l.productId && l.qty).map(l => ({
          productId: Number(l.productId), qty: Number(l.qty),
          damageType: l.damageType, note: l.note || null,
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-damage"] }); toast({ title: "Laporan dibuat" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/damage/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-damage"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-detail"] });
      toast({ title: "Dikonfirmasi — stok dikurangi & dicatat sebagai kerusakan" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/damage/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-damage"] }); toast({ title: "Laporan dibatalkan" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const addLine = () => setLines(l => [...l, { productId: "", qty: "", damageType: "rusak", note: "" }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, j) => j !== i));
  const setLine = (i: number, f: string, v: string) => setLines(l => l.map((item, j) => j === i ? { ...item, [f]: v } : item));

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle size={22} className="text-orange-500" /> Barang Rusak / Hilang</h1>
            <p className="text-sm text-muted-foreground mt-1">Catat barang rusak, hilang, atau kadaluarsa — stok dikurangi saat dikonfirmasi</p>
          </div>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Buat Laporan</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>No. Laporan</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Dikonfirmasi</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                : reports.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Belum ada laporan</TableCell></TableRow>
                : reports.map(r => (
                  <>
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <TableCell>{expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</TableCell>
                      <TableCell className="font-mono text-xs">{r.report_number}</TableCell>
                      <TableCell className="text-sm font-medium">{r.warehouse_name}</TableCell>
                      <TableCell className="text-sm">{r.branch_name ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[r.status] ?? ""}`}>
                          {r.status === "draft" ? "Draft" : r.status === "confirmed" ? "Dikonfirmasi" : "Dibatalkan"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-sm">{r.confirmed_at ? fmtDate(r.confirmed_at) : "—"}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        {r.status === "draft" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="destructive" onClick={() => confirmMutation.mutate(r.id)} disabled={confirmMutation.isPending}>
                              <CheckCircle size={13} className="mr-1" /> Konfirmasi
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(r.id)} disabled={cancelMutation.isPending}>Batal</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded === r.id && r.lines && (
                      <TableRow key={`${r.id}-lines`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-3">
                          <table className="w-full text-sm">
                            <thead><tr className="text-muted-foreground text-xs"><th className="text-left pb-1">Produk</th><th className="text-right pb-1">Qty</th><th className="text-left pb-1">Alasan</th><th className="text-left pb-1">Catatan</th></tr></thead>
                            <tbody>
                              {r.lines.map((l, i) => (
                                <tr key={i} className="border-t border-border/40">
                                  <td className="py-1">{l.product_name} <span className="text-muted-foreground text-xs">({l.sku})</span></td>
                                  <td className="text-right">{fmt(l.qty)} {l.unit}</td>
                                  <td className="pl-3"><span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{DAMAGE_TYPES.find(d => d.value === l.damage_type)?.label ?? l.damage_type}</span></td>
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
            <DialogHeader><DialogTitle>Laporan Barang Rusak / Hilang</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Gudang *</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Item *</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus size={13} className="mr-1" /> Tambah</Button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="space-y-1 border rounded p-2 bg-muted/20">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Select value={line.productId} onValueChange={v => setLine(i, "productId", v)}>
                            <SelectTrigger><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                            <SelectContent>
                              {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input type="number" placeholder="Qty" value={line.qty} onChange={e => setLine(i, "qty", e.target.value)} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <Select value={line.damageType} onValueChange={v => setLine(i, "damageType", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DAMAGE_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input placeholder="Catatan..." className="col-span-1" value={line.note} onChange={e => setLine(i, "note", e.target.value)} />
                        {lines.length > 1 && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeLine(i)}><Trash2 size={13} /></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Catatan Umum</Label>
                <Textarea rows={2} placeholder="Keterangan tambahan..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button disabled={createMutation.isPending || !form.warehouseId} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Membuat..." : "Simpan Laporan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
