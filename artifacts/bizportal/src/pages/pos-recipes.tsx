import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChefHat, X } from "lucide-react";

interface Product { id: number; name: string; }
interface InvItem { id: number; name: string; unit: string; sku: string; }
interface RecipeItem { item_id: number; item_name: string; unit: string; qty: string; }
interface Recipe { id: number; product_id: number; product_name: string; note: string | null; items: RecipeItem[]; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function PosRecipesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [form, setForm] = useState({ productId: "", note: "" });
  const [lineItems, setLineItems] = useState<{ itemId: string; qty: string }[]>([]);

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({ queryKey: ["pos-recipes"], queryFn: () => apiFetch("/pos-inventory/recipes") });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["pos-products-list"], queryFn: () => apiFetch("/pos-kasir/products/all") });
  const { data: invItems = [] } = useQuery<InvItem[]>({ queryKey: ["pos-inventory-items"], queryFn: () => apiFetch("/pos-inventory/inventory-items") });

  const saveMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/recipes", {
      method: "POST",
      body: JSON.stringify({
        productId: Number(form.productId),
        note: form.note || undefined,
        items: lineItems.filter(l => l.itemId && l.qty).map(l => ({ itemId: Number(l.itemId), qty: Number(l.qty) })),
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-recipes"] }); toast({ title: "Resep disimpan" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-recipes"] }); toast({ title: "Resep dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm({ productId: "", note: "" });
    setLineItems([{ itemId: "", qty: "" }]);
    setOpen(true);
  }

  function openEdit(r: Recipe) {
    setEditing(r);
    setForm({ productId: String(r.product_id), note: r.note ?? "" });
    setLineItems(r.items.map(i => ({ itemId: String(i.item_id), qty: String(i.qty) })));
    setOpen(true);
  }

  function addLine() { setLineItems(l => [...l, { itemId: "", qty: "" }]); }
  function removeLine(idx: number) { setLineItems(l => l.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: "itemId" | "qty", val: string) {
    setLineItems(l => l.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  function handleSave() {
    if (!form.productId) { toast({ title: "Produk wajib dipilih", variant: "destructive" }); return; }
    if (lineItems.filter(l => l.itemId && l.qty).length === 0) { toast({ title: "Minimal 1 bahan baku", variant: "destructive" }); return; }
    saveMutation.mutate();
  }

  const usedProductIds = new Set(recipes.map(r => r.product_id));

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ChefHat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Resep / BOM Menu</h1>
              <p className="text-sm text-muted-foreground">Tentukan bahan baku untuk setiap menu</p>
            </div>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Tambah Resep
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm col-span-3">Memuat...</p>
          ) : recipes.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <ChefHat className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Belum ada resep. Klik "Tambah Resep" untuk memulai.</p>
            </div>
          ) : recipes.map(r => (
            <Card key={r.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{r.product_name}</CardTitle>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Hapus resep ini?")) deleteMutation.mutate(r.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs h-8">Bahan</TableHead>
                      <TableHead className="text-xs h-8 text-right">Qty</TableHead>
                      <TableHead className="text-xs h-8">Satuan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm py-1.5">{item.item_name}</TableCell>
                        <TableCell className="text-sm py-1.5 text-right">{Number(item.qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })}</TableCell>
                        <TableCell className="text-sm py-1.5 text-muted-foreground">{item.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Resep" : "Tambah Resep"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Menu / Produk *</Label>
              <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih menu" /></SelectTrigger>
                <SelectContent>
                  {products.map((p: Product) => (
                    <SelectItem key={p.id} value={String(p.id)} disabled={!editing && usedProductIds.has(p.id)}>
                      {p.name} {!editing && usedProductIds.has(p.id) ? "(sudah ada resep)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bahan Baku</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Tambah Baris
                </Button>
              </div>
              <div className="space-y-2">
                {lineItems.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={line.itemId} onValueChange={v => updateLine(i, "itemId", v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih bahan" /></SelectTrigger>
                      <SelectContent>
                        {invItems.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name} ({item.unit})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" className="w-24" value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} placeholder="Qty" />
                    <Button size="icon" variant="ghost" className="shrink-0 text-destructive hover:text-destructive h-8 w-8" onClick={() => removeLine(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
