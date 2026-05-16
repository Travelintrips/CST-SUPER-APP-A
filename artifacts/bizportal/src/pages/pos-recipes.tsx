import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChefHat, X, FlaskConical } from "lucide-react";

interface Product { id: number; name: string; }
interface InvItem { id: number; name: string; unit: string; sku: string; }
interface RecipeItem {
  item_id: number;
  item_name: string;
  unit: string;
  qty: string;
  waste_pct: string | null;
  notes: string | null;
}
interface Recipe {
  id: number;
  product_id: number;
  product_name: string;
  recipe_name: string | null;
  yield_qty: string;
  yield_unit: string;
  is_active: boolean;
  note: string | null;
  items: RecipeItem[];
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const EMPTY_LINE = { itemId: "", qty: "", wastePct: "", notes: "" };

export default function PosRecipesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [form, setForm] = useState({
    productId: "",
    recipeName: "",
    yieldQty: "1",
    yieldUnit: "pcs",
    isActive: true,
    note: "",
  });
  const [lineItems, setLineItems] = useState<{ itemId: string; qty: string; wastePct: string; notes: string }[]>([EMPTY_LINE]);

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ["pos-recipes"],
    queryFn: () => apiFetch("/pos-inventory/recipes"),
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["pos-products-list"],
    queryFn: () => apiFetch("/pos-kasir/products/all"),
  });
  const { data: invItems = [] } = useQuery<InvItem[]>({
    queryKey: ["pos-inventory-items"],
    queryFn: () => apiFetch("/pos-inventory/inventory-items"),
  });

  const saveMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/recipes", {
      method: "POST",
      body: JSON.stringify({
        productId: Number(form.productId),
        recipeName: form.recipeName || undefined,
        yieldQty: Number(form.yieldQty) || 1,
        yieldUnit: form.yieldUnit || "pcs",
        isActive: form.isActive,
        note: form.note || undefined,
        items: lineItems
          .filter(l => l.itemId && l.qty)
          .map(l => ({
            itemId: Number(l.itemId),
            qty: Number(l.qty),
            wastePct: l.wastePct ? Number(l.wastePct) : null,
            notes: l.notes || null,
          })),
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-recipes"] });
      toast({ title: "Resep disimpan" });
      setOpen(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-recipes"] }); toast({ title: "Resep dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm({ productId: "", recipeName: "", yieldQty: "1", yieldUnit: "pcs", isActive: true, note: "" });
    setLineItems([{ ...EMPTY_LINE }]);
    setOpen(true);
  }

  function openEdit(r: Recipe) {
    setEditing(r);
    setForm({
      productId: String(r.product_id),
      recipeName: r.recipe_name ?? "",
      yieldQty: String(r.yield_qty),
      yieldUnit: r.yield_unit,
      isActive: r.is_active,
      note: r.note ?? "",
    });
    setLineItems(r.items.map(i => ({
      itemId: String(i.item_id),
      qty: String(i.qty),
      wastePct: i.waste_pct ?? "",
      notes: i.notes ?? "",
    })));
    setOpen(true);
  }

  function addLine() { setLineItems(l => [...l, { ...EMPTY_LINE }]); }
  function removeLine(idx: number) { setLineItems(l => l.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: keyof typeof EMPTY_LINE, val: string) {
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
              <p className="text-sm text-muted-foreground">Tentukan bahan baku untuk setiap menu racikan</p>
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
            <Card key={r.id} className={`transition-colors ${r.is_active ? "hover:border-primary/50" : "opacity-60"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{r.product_name}</CardTitle>
                    {r.recipe_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <FlaskConical className="h-3 w-3" /> {r.recipe_name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={r.is_active ? "default" : "secondary"} className="text-xs h-5">
                      {r.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Hapus resep ini?")) deleteMutation.mutate(r.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    Yield: <span className="font-medium text-foreground">{Number(r.yield_qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })} {r.yield_unit}</span>
                  </span>
                  {r.note && <span className="text-xs text-muted-foreground">· {r.note}</span>}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs h-8">Bahan</TableHead>
                      <TableHead className="text-xs h-8 text-right">Qty</TableHead>
                      <TableHead className="text-xs h-8">Satuan</TableHead>
                      <TableHead className="text-xs h-8 text-right">Susut%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm py-1.5">
                          {item.item_name}
                          {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                        </TableCell>
                        <TableCell className="text-sm py-1.5 text-right font-mono">
                          {Number(item.qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })}
                        </TableCell>
                        <TableCell className="text-sm py-1.5 text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-sm py-1.5 text-right text-muted-foreground">
                          {item.waste_pct ? `${item.waste_pct}%` : "—"}
                        </TableCell>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Resep" : "Tambah Resep"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
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
                <Label>Nama Resep</Label>
                <Input value={form.recipeName} onChange={e => setForm(f => ({ ...f, recipeName: e.target.value }))} placeholder="Cth: Thai Tea Original 1 cup" />
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
              </div>
              <div className="space-y-2">
                <Label>Yield Qty</Label>
                <Input type="number" value={form.yieldQty} onChange={e => setForm(f => ({ ...f, yieldQty: e.target.value }))} placeholder="1" />
              </div>
              <div className="space-y-2">
                <Label>Yield Unit</Label>
                <Input value={form.yieldUnit} onChange={e => setForm(f => ({ ...f, yieldUnit: e.target.value }))} placeholder="cup, pcs, porsi..." />
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Switch
                  id="is-active"
                  checked={form.isActive}
                  onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="is-active">Resep aktif (dipakai saat transaksi POS)</Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bahan Baku</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Tambah Baris
                </Button>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Bahan</TableHead>
                      <TableHead className="text-xs w-24">Qty</TableHead>
                      <TableHead className="text-xs w-20">Susut %</TableHead>
                      <TableHead className="text-xs">Keterangan</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="py-1.5">
                          <Select value={line.itemId} onValueChange={v => updateLine(i, "itemId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih bahan" /></SelectTrigger>
                            <SelectContent>
                              {invItems.map(item => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                  {item.name} ({item.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" className="h-8 text-xs" value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} placeholder="0" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input type="number" className="h-8 text-xs" value={line.wastePct} onChange={e => updateLine(i, "wastePct", e.target.value)} placeholder="0" min="0" max="100" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input className="h-8 text-xs" value={line.notes} onChange={e => updateLine(i, "notes", e.target.value)} placeholder="Opsional" />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLine(i)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
