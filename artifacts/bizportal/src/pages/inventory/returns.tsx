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
import { RotateCcw, Plus, CheckCircle, ChevronDown, ChevronUp, Trash2, Info } from "lucide-react";

interface Wh { id: number; warehouse_name: string; branch_name: string | null; }
interface Product { id: number; name: string; sku: string; unit: string; }
interface RetLine {
  product_id: number; product_name: string; sku: string; unit: string;
  qty: number; unit_cost: number; condition: string; note: string | null;
}
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
const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

const TYPE_LABEL: Record<string, string> = { purchase: "Retur Pembelian", sales: "Retur Penjualan" };
const STATUS_CLS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const CONDITIONS = [
  { value: "layak", label: "Layak Pakai", desc: "Masuk stok kembali (khusus retur penjualan)" },
  { value: "rusak", label: "Rusak", desc: "Tidak masuk stok — dicatat sebagai kerusakan" },
  { value: "hilang", label: "Hilang", desc: "Tidak masuk stok — dicatat sebagai kehilangan" },
  { value: "expired", label: "Kadaluarsa", desc: "Tidak masuk stok — dicatat sebagai kadaluarsa" },
];

const COND_STYLE: Record<string, string> = {
  layak: "bg-green-100 text-green-700",
  rusak: "bg-red-100 text-red-700",
  hilang: "bg-orange-100 text-orange-700",
  expired: "bg-yellow-100 text-yellow-700",
};

export default function InventoryReturnsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({ type: "sales", warehouseId: "", refDocNumber: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string; unitCost: string; condition: string; note: string }[]>([
    { productId: "", qty: "", unitCost: "", condition: "layak", note: "" },
  ]);

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: returns = [], isLoading } = useQuery<Return[]>({ queryKey: ["inv-returns"], queryFn: () => apiFetch("/inventory/returns") });

  const openNew = () => {
    setForm({ type: "sales", warehouseId: "", refDocNumber: "", note: "" });
    setLines([{ productId: "", qty: "", unitCost: "", condition: "layak", note: "" }]);
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
          condition: l.condition,
          note: l.note || null,
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-returns"] }); toast({ title: "Retur dibuat" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/returns/${id}/confirm`, { method: "POST" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["inv-returns"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-detail"] });
      qc.invalidateQueries({ queryKey: ["inv-movements"] });
      const ret = returns.find(r => r.id === id);
      const hasRusak = ret?.lines?.some(l => l.condition !== "layak");
      toast({
        title: "Retur dikonfirmasi",
        description: hasRusak
          ? "Item kondisi layak masuk stok. Item rusak/hilang dicatat sebagai damage movement."
          : "Semua item masuk stok.",
      });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const addLine = () => setLines(l => [...l, { productId: "", qty: "", unitCost: "", condition: "layak", note: "" }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, j) => j !== i));
  const setLine = (i: number, f: string, v: string) => setLines(l => l.map((item, j) => j === i ? { ...item, [f]: v } : item));

  const isSalesReturn = form.type === "sales";

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><RotateCcw size={22} /> Retur Barang</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Retur penjualan (kondisi layak → stok masuk, rusak → damage) &amp; retur pembelian (stok keluar)
            </p>
          </div>
          <Button onClick={openNew}><Plus size={16} className="mr-1" /> Buat Retur</Button>
        </div>

        {/* Keterangan logika kondisi */}
        <div className="rounded-lg border bg-blue-50 border-blue-200 p-3 text-sm text-blue-800 flex gap-2">
          <Info size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>Logika kondisi barang:</strong><br />
            <span className="text-xs">
              • <strong>Retur Penjualan + Layak</strong> → stok bertambah (return_in)<br />
              • <strong>Retur Penjualan + Rusak/Hilang/Expired</strong> → tidak masuk stok, dicatat sebagai damage movement<br />
              • <strong>Retur Pembelian</strong> → stok berkurang (return_out), kondisi tetap dicatat di catatan
            </span>
          </div>
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
                {isLoading
                  ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                  : returns.length === 0
                  ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Belum ada retur</TableCell></TableRow>
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
                          <TableCell colSpan={8} className="bg-muted/20 p-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              {r.type === "sales"
                                ? "Retur penjualan: item layak → stok masuk | item rusak/hilang → damage movement"
                                : "Retur pembelian: semua item → stok berkurang"}
                            </p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-muted-foreground text-xs">
                                  <th className="text-left pb-1">Produk</th>
                                  <th className="text-right pb-1">Qty</th>
                                  <th className="text-left pb-1 pl-3">Kondisi</th>
                                  <th className="text-right pb-1">HPP</th>
                                  <th className="text-left pb-1 pl-3">Efek Stok</th>
                                  <th className="text-left pb-1 pl-3">Catatan</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.lines.map((l, i) => {
                                  const isLayak = l.condition === "layak";
                                  const isSales = r.type === "sales";
                                  let stockEffect = "";
                                  if (isSales) {
                                    stockEffect = isLayak ? "✅ Masuk stok" : "⚠️ Damage — tidak masuk stok";
                                  } else {
                                    stockEffect = "📤 Keluar stok";
                                  }
                                  return (
                                    <tr key={i} className="border-t border-border/40">
                                      <td className="py-1">{l.product_name} <span className="text-muted-foreground text-xs">({l.sku})</span></td>
                                      <td className="text-right">{fmt(l.qty)} {l.unit}</td>
                                      <td className="pl-3">
                                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${COND_STYLE[l.condition] ?? "bg-gray-100 text-gray-700"}`}>
                                          {CONDITIONS.find(c => c.value === l.condition)?.label ?? l.condition}
                                        </span>
                                      </td>
                                      <td className="text-right">{fmtCurr(l.unit_cost)}</td>
                                      <td className="pl-3 text-xs">{stockEffect}</td>
                                      <td className="pl-3 text-muted-foreground text-xs">{l.note ?? "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {r.note && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">Catatan: {r.note}</p>}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Form Buat Retur */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Buat Retur Barang</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipe Retur *</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Retur Penjualan (dari pelanggan)</SelectItem>
                      <SelectItem value="purchase">Retur Pembelian (ke supplier)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isSalesReturn
                      ? "Item layak → stok masuk. Item rusak/hilang → damage movement."
                      : "Semua item akan dikurangi dari stok gudang."}
                  </p>
                </div>
                <div>
                  <Label>Gudang *</Label>
                  <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>No. Referensi Dokumen</Label>
                <Input
                  placeholder="SO/2025/001 atau PO/2025/001"
                  value={form.refDocNumber}
                  onChange={e => setForm(f => ({ ...f, refDocNumber: e.target.value }))}
                />
              </div>

              {/* Item Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Item Retur *</Label>
                  <Button size="sm" variant="outline" onClick={addLine}><Plus size={13} className="mr-1" /> Tambah Item</Button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {lines.map((line, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-muted/10 space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-start">
                        {/* Produk */}
                        <div className="col-span-5">
                          <Label className="text-xs text-muted-foreground">Produk *</Label>
                          <Select value={line.productId} onValueChange={v => setLine(i, "productId", v)}>
                            <SelectTrigger><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>{p.name} <span className="text-muted-foreground">({p.sku})</span></SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Qty */}
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Qty *</Label>
                          <Input type="number" placeholder="0" value={line.qty} onChange={e => setLine(i, "qty", e.target.value)} />
                        </div>
                        {/* HPP */}
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">HPP</Label>
                          <Input type="number" placeholder="0" value={line.unitCost} onChange={e => setLine(i, "unitCost", e.target.value)} />
                        </div>
                        {/* Kondisi */}
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Kondisi Barang *</Label>
                          <Select value={line.condition} onValueChange={v => setLine(i, "condition", v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CONDITIONS.map(c => (
                                <SelectItem key={c.value} value={c.value}>
                                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${c.value === "layak" ? "bg-green-500" : c.value === "rusak" ? "bg-red-500" : c.value === "hilang" ? "bg-orange-500" : "bg-yellow-500"}`}></span>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Hapus */}
                        <div className="col-span-1 pt-5">
                          {lines.length > 1 && (
                            <Button size="icon" variant="ghost" className="text-destructive h-9 w-9" onClick={() => removeLine(i)}>
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Keterangan kondisi */}
                      {isSalesReturn && (
                        <p className="text-xs text-muted-foreground pl-1">
                          {line.condition === "layak"
                            ? "✅ Barang layak — akan masuk kembali ke stok gudang"
                            : `⚠️ Barang ${CONDITIONS.find(c => c.value === line.condition)?.label.toLowerCase()} — tidak masuk stok, dicatat sebagai damage movement`}
                        </p>
                      )}
                      {/* Catatan per item */}
                      <Input
                        placeholder="Catatan item (opsional)..."
                        className="h-8 text-xs"
                        value={line.note}
                        onChange={e => setLine(i, "note", e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Catatan Umum</Label>
                <Textarea
                  rows={2}
                  placeholder="Keterangan tambahan untuk seluruh retur..."
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button
                disabled={createMutation.isPending || !form.warehouseId || lines.filter(l => l.productId && l.qty).length === 0}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Membuat..." : "Buat Retur"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
