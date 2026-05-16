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
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Plus, Pencil, Trash2, X } from "lucide-react";

interface Product { id: number; name: string; sku: string; unit: string; }
interface RecipeItem { id: number; ingredient_product_id: number; ingredient_name: string; ingredient_sku: string; ingredient_unit: string; qty: number; unit: string; }
interface Recipe {
  id: number; product_id: number; product_name: string; sku: string; unit: string;
  yield_qty: number; yield_unit: string; note: string | null; is_active: boolean;
  items: RecipeItem[] | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

export default function WarehouseRecipesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [form, setForm] = useState({ productId: "", yieldQty: "1", yieldUnit: "pcs", note: "" });
  const [items, setItems] = useState<{ ingredientProductId: string; qty: string; unit: string; note: string }[]>([
    { ingredientProductId: "", qty: "", unit: "pcs", note: "" }
  ]);

  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products-list"], queryFn: () => apiFetch("/trading/products?limit=500") });
  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({ queryKey: ["wh-recipes"], queryFn: () => apiFetch("/warehouse/recipes") });

  function openCreate() {
    setEditing(null);
    setForm({ productId: "", yieldQty: "1", yieldUnit: "pcs", note: "" });
    setItems([{ ingredientProductId: "", qty: "", unit: "pcs", note: "" }]);
    setOpen(true);
  }

  function openEdit(r: Recipe) {
    setEditing(r);
    setForm({ productId: String(r.product_id), yieldQty: String(r.yield_qty), yieldUnit: r.yield_unit, note: r.note ?? "" });
    setItems(r.items?.map(i => ({ ingredientProductId: String(i.ingredient_product_id), qty: String(i.qty), unit: i.unit, note: "" })) ?? [{ ingredientProductId: "", qty: "", unit: "pcs", note: "" }]);
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: (data: typeof form & { items: typeof items }) => apiFetch("/warehouse/recipes", {
      method: "POST", body: JSON.stringify({
        productId: Number(data.productId), yieldQty: Number(data.yieldQty),
        yieldUnit: data.yieldUnit, note: data.note || null,
        items: data.items.filter(i => i.ingredientProductId && i.qty).map(i => ({
          ingredientProductId: Number(i.ingredientProductId),
          qty: Number(i.qty), unit: i.unit || "pcs",
        })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-recipes"] }); toast({ title: "Resep disimpan" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/warehouse/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-recipes"] }); toast({ title: "Resep dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ChefHat size={24} /> Resep / BOM</h1>
            <p className="text-muted-foreground text-sm mt-1">Bill of Materials — bahan baku untuk produk racikan (Thai Tea, dll)</p>
          </div>
          <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Buat Resep</Button>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Memuat...</CardContent></Card>
          ) : recipes.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Belum ada resep</CardContent></Card>
          ) : recipes.map(r => (
            <Card key={r.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{r.product_name}</h3>
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{r.sku}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Yield: {fmt(r.yield_qty)} {r.yield_unit}</p>
                    {r.note && <p className="text-xs text-muted-foreground mt-1">{r.note}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Hapus resep ini?")) deleteMutation.mutate(r.id) }}><Trash2 size={14} className="text-red-500" /></Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bahan Baku</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Satuan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.items?.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.ingredient_name}</TableCell>
                          <TableCell className="font-mono text-xs">{item.ingredient_sku}</TableCell>
                          <TableCell className="text-right">{fmt(item.qty)}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Edit Resep" : "Buat Resep Baru"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 space-y-1">
                  <Label>Produk Hasil</Label>
                  <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))} disabled={!!editing}>
                    <SelectTrigger><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                    <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Yield Qty</Label>
                  <Input type="number" value={form.yieldQty} onChange={e => setForm(f => ({ ...f, yieldQty: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Satuan Yield</Label>
                  <Input value={form.yieldUnit} onChange={e => setForm(f => ({ ...f, yieldUnit: e.target.value }))} placeholder="pcs, cup, dll" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Catatan</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." />
              </div>
              <div className="space-y-2">
                <Label>Bahan Baku (Ingredients)</Label>
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_24px] gap-2 items-center">
                    <Select value={item.ingredientProductId} onValueChange={v => setItems(is => is.map((x, j) => j === i ? { ...x, ingredientProductId: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Bahan baku..." /></SelectTrigger>
                      <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.unit})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="Qty" value={item.qty} onChange={e => setItems(is => is.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                    <Input placeholder="Satuan" value={item.unit} onChange={e => setItems(is => is.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                    {items.length > 1 && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setItems(is => is.filter((_, j) => j !== i))}><X size={12} /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setItems(is => [...is, { ingredientProductId: "", qty: "", unit: "pcs", note: "" }])}><Plus size={14} className="mr-1" /> Tambah Bahan</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={() => saveMutation.mutate({ ...form, items })} disabled={saveMutation.isPending || !form.productId}>
                {saveMutation.isPending ? "Menyimpan..." : "Simpan Resep"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
