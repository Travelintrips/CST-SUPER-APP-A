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
import { AlertTriangle, Plus, CheckCircle, X } from "lucide-react";

interface Wh { id: number; name: string; branch_name: string; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface DamageLine { product_name: string; sku: string; unit: string; qty: number; damage_type: string; note: string | null; }
interface DamageReport {
  id: number; report_number: string; status: string; note: string | null;
  warehouse_name: string; created_at: string; confirmed_at: string | null;
  lines: DamageLine[] | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const DAMAGE_TYPES = [
  { value: "rusak", label: "Rusak" },
  { value: "hilang", label: "Hilang" },
  { value: "expired", label: "Kedaluwarsa" },
  { value: "lainnya", label: "Lainnya" },
];

export default function WarehouseDamagePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ warehouseId: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string; damageType: string; note: string }[]>([
    { productId: "", qty: "", damageType: "rusak", note: "" }
  ]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["wh-warehouses"], queryFn: () => apiFetch("/warehouse/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: reports = [], isLoading } = useQuery<DamageReport[]>({ queryKey: ["wh-damage"], queryFn: () => apiFetch("/warehouse/damage") });

  const createMutation = useMutation({
    mutationFn: (data: typeof form & { lines: typeof lines }) => apiFetch("/warehouse/damage", {
      method: "POST", body: JSON.stringify({
        warehouseId: Number(data.warehouseId), note: data.note || null,
        lines: data.lines.filter(l => l.productId && l.qty).map(l => ({
          productId: Number(l.productId), qty: Number(l.qty),
          damageType: l.damageType, note: l.note || null,
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-damage"] }); toast({ title: "Laporan dibuat" }); setOpen(false); setForm({ warehouseId: "", note: "" }); setLines([{ productId: "", qty: "", damageType: "rusak", note: "" }]); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/warehouse/damage/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-damage"] }); qc.invalidateQueries({ queryKey: ["wh-stock-summary"] }); toast({ title: "Laporan dikonfirmasi, stok dikurangi" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle size={24} className="text-red-500" /> Barang Rusak / Hilang</h1>
            <p className="text-muted-foreground text-sm mt-1">Laporan barang rusak, hilang, atau kedaluwarsa</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus size={16} className="mr-1" /> Buat Laporan</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Laporan</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : reports.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Belum ada laporan</TableCell></TableRow>
                ) : reports.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.report_number}</TableCell>
                    <TableCell className="text-sm">{r.warehouse_name}</TableCell>
                    <TableCell>
                      {r.lines?.map((l, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium">{l.product_name}</span>
                          {" "}<span className="text-muted-foreground">×{l.qty} {l.unit}</span>
                          {" "}<Badge variant="outline" className="text-xs">{l.damage_type}</Badge>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "confirmed" ? "outline" : r.status === "cancelled" ? "destructive" : "secondary"}>
                        {r.status === "confirmed" ? "Dikonfirmasi" : r.status === "cancelled" ? "Dibatalkan" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("id-ID")}</TableCell>
                    <TableCell className="text-xs max-w-32 truncate">{r.note ?? "-"}</TableCell>
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
            <DialogHeader><DialogTitle>Buat Laporan Kerusakan</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Gudang</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Catatan Laporan</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." />
              </div>
              <div className="space-y-2">
                <Label>Daftar Barang</Label>
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_120px_1fr_24px] gap-2 items-center">
                    <Select value={line.productId} onValueChange={v => setLines(ls => ls.map((l, j) => j === i ? { ...l, productId: v } : l))}>
                      <SelectTrigger><SelectValue placeholder="Produk..." /></SelectTrigger>
                      <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Qty" value={line.qty} onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, qty: e.target.value } : l))} />
                    <Select value={line.damageType} onValueChange={v => setLines(ls => ls.map((l, j) => j === i ? { ...l, damageType: v } : l))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DAMAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Catatan item..." value={line.note} onChange={e => setLines(ls => ls.map((l, j) => j === i ? { ...l, note: e.target.value } : l))} />
                    {lines.length > 1 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X size={12} /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setLines(ls => [...ls, { productId: "", qty: "", damageType: "rusak", note: "" }])}><Plus size={14} className="mr-1" /> Tambah</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={() => createMutation.mutate({ ...form, lines })} disabled={createMutation.isPending || !form.warehouseId}>
                {createMutation.isPending ? "Menyimpan..." : "Buat Laporan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
