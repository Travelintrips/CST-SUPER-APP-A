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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Boxes, AlertTriangle, SlidersHorizontal } from "lucide-react";

interface Wh { id: number; warehouse_name: string; branch_name: string | null; }
interface Branch { id: number; name: string; }
interface StockSummary { product_id: number; product_name: string; sku: string; unit: string; total_qty: number; avg_cost_price: number; total_value: number; warehouse_count: number; has_zero: boolean; }
interface StockRow { id: number; product_id: number; product_name: string; sku: string; unit: string; warehouse_id: number; warehouse_name: string; rack_code: string | null; rack_name: string | null; branch_id: number | null; branch_name: string | null; qty: number; cost_price: number; }

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
const fmtCurr = (n: number) => "Rp " + Number(n).toLocaleString("id-ID");

export default function InventoryStockPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [warehouseId, setWarehouseId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ productId: "", warehouseId: "", rackId: "", qty: "", costPrice: "", note: "" });

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["inv-branches"], queryFn: () => apiFetch("/inventory/branches") });

  const buildParams = () => {
    const p = new URLSearchParams();
    if (warehouseId !== "all") p.set("warehouseId", warehouseId);
    if (branchId !== "all") p.set("branchId", branchId);
    return p.toString() ? `?${p}` : "";
  };

  const { data: summary = [], isLoading: sumLoading } = useQuery<StockSummary[]>({
    queryKey: ["inv-stock-summary", branchId],
    queryFn: () => apiFetch(`/inventory/stock/summary${branchId !== "all" ? `?branchId=${branchId}` : ""}`),
    enabled: view === "summary",
  });

  const { data: detail = [], isLoading: detLoading } = useQuery<StockRow[]>({
    queryKey: ["inv-stock-detail", warehouseId, branchId],
    queryFn: () => apiFetch(`/inventory/stock${buildParams()}`),
    enabled: view === "detail",
  });

  const filteredSummary = summary.filter(s => s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase()));
  const filteredDetail = detail.filter(s => s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase()));

  const totalValue = summary.reduce((a, s) => a + s.total_value, 0);
  const zeroCount = summary.filter(s => s.total_qty <= 0).length;

  const adjustMutation = useMutation({
    mutationFn: (d: typeof adjustForm) => apiFetch("/inventory/stock/adjust", {
      method: "POST",
      body: JSON.stringify({ productId: Number(d.productId), warehouseId: Number(d.warehouseId), rackId: d.rackId ? Number(d.rackId) : null, qty: Number(d.qty), costPrice: d.costPrice ? Number(d.costPrice) : undefined, note: d.note || null }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-detail"] });
      toast({ title: "Stok disesuaikan" });
      setAdjustOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes size={22} /> Stok</h1>
            <p className="text-sm text-muted-foreground mt-1">Lihat dan kelola stok per gudang & cabang</p>
          </div>
          <Button variant="outline" onClick={() => setAdjustOpen(true)}><SlidersHorizontal size={16} className="mr-1" /> Penyesuaian Manual</Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Produk</p><p className="text-2xl font-bold">{summary.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle size={13} className="text-red-500" /> Stok Nol</p><p className="text-2xl font-bold text-red-500">{zeroCount}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Nilai Stok</p><p className="text-xl font-bold">{fmtCurr(totalValue)}</p></CardContent></Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input placeholder="Cari produk/SKU..." value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
          <Select value={view} onValueChange={v => setView(v as "summary" | "detail")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Ringkasan</SelectItem>
              <SelectItem value="detail">Per Gudang</SelectItem>
            </SelectContent>
          </Select>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Semua Cabang" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Cabang</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {view === "detail" && (
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Semua Gudang" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Gudang</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {view === "summary" ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Total Stok</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">HPP Rata</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead className="text-center">Gudang</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sumLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                  : filteredSummary.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                  : filteredSummary.map(s => (
                    <TableRow key={s.product_id}>
                      <TableCell className="font-medium">{s.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(s.total_qty)}</TableCell>
                      <TableCell>{s.unit}</TableCell>
                      <TableCell className="text-right text-sm">{fmtCurr(s.avg_cost_price)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtCurr(s.total_value)}</TableCell>
                      <TableCell className="text-center">{s.warehouse_count}</TableCell>
                      <TableCell>
                        {s.total_qty <= 0
                          ? <Badge variant="destructive">Habis</Badge>
                          : s.has_zero
                          ? <Badge variant="outline" className="border-yellow-500 text-yellow-700">Ada Nol</Badge>
                          : <Badge variant="outline" className="border-green-500 text-green-700">Tersedia</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Rak</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">HPP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                  : filteredDetail.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                  : filteredDetail.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{s.branch_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{s.warehouse_name}</TableCell>
                      <TableCell className="text-xs font-mono">{s.rack_code ? `${s.rack_code} - ${s.rack_name}` : "—"}</TableCell>
                      <TableCell className="font-medium">{s.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                      <TableCell className={`text-right font-bold ${s.qty <= 0 ? "text-red-500" : ""}`}>{fmt(s.qty)}</TableCell>
                      <TableCell>{s.unit}</TableCell>
                      <TableCell className="text-right text-sm">{fmtCurr(s.cost_price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Penyesuaian Manual */}
        <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Penyesuaian Stok Manual</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground text-xs">Masukkan nilai positif untuk tambah stok, negatif untuk kurangi.</p>
              <div>
                <Label>ID Produk *</Label>
                <Input type="number" placeholder="ID produk" value={adjustForm.productId} onChange={e => setAdjustForm(f => ({ ...f, productId: e.target.value }))} />
              </div>
              <div>
                <Label>Gudang *</Label>
                <Select value={adjustForm.warehouseId} onValueChange={v => setAdjustForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Qty (+/-) *</Label>
                  <Input type="number" placeholder="0" value={adjustForm.qty} onChange={e => setAdjustForm(f => ({ ...f, qty: e.target.value }))} />
                </div>
                <div>
                  <Label>HPP (opsional)</Label>
                  <Input type="number" placeholder="0" value={adjustForm.costPrice} onChange={e => setAdjustForm(f => ({ ...f, costPrice: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Catatan</Label>
                <Textarea rows={2} placeholder="Alasan penyesuaian..." value={adjustForm.note} onChange={e => setAdjustForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjustOpen(false)}>Batal</Button>
              <Button disabled={adjustMutation.isPending} onClick={() => adjustMutation.mutate(adjustForm)}>
                {adjustMutation.isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
