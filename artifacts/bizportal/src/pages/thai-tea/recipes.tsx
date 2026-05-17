import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChefHat, X, Pencil, RefreshCw, FlaskConical } from "lucide-react";

const fmt = (n: number | null | undefined, dec = 3) => Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: dec });

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include", ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any)?.message ?? `Error ${res.status}`); }
  return res.json();
}

interface Ingredient { id?: number; ingredient_product_id: number; ingredient_name: string; unit: string; qty: number; note?: string | null; }
interface Recipe {
  id: number; product_id: number; product_name: string;
  yield_qty: number; yield_unit: string; note: string | null; is_active: boolean;
  ingredients: Ingredient[] | null;
}
interface ThaiTeaProduct { id: number; name: string; sku: string; unit: string; }

const UNITS = ["gram", "ml", "liter", "kg", "pcs", "sdm", "sdt", "sachet", "kaleng"];
const YIELD_UNITS = ["cup", "porsi", "liter", "kg", "pcs", "batch"];

interface LineForm { ingredientProductId: string; qty: string; unit: string; note: string; }
const EMPTY_LINE: LineForm = { ingredientProductId: "", qty: "", unit: "gram", note: "" };

function RecipeDialog({
  open, onClose, products, editing, onSave,
}: {
  open: boolean; onClose: () => void;
  products: ThaiTeaProduct[];
  editing: Recipe | null;
  onSave: (data: object) => Promise<void>;
}) {
  const { toast } = useToast();
  const [productId, setProductId] = useState(editing ? String(editing.product_id) : "");
  const [yieldQty, setYieldQty] = useState(editing ? String(editing.yield_qty) : "1");
  const [yieldUnit, setYieldUnit] = useState(editing?.yield_unit ?? "cup");
  const [note, setNote] = useState(editing?.note ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [lines, setLines] = useState<LineForm[]>(
    editing?.ingredients?.length
      ? editing.ingredients.map((i) => ({
          ingredientProductId: String(i.ingredient_product_id),
          qty: String(i.qty),
          unit: i.unit,
          note: i.note ?? "",
        }))
      : [{ ...EMPTY_LINE }]
  );
  const [saving, setSaving] = useState(false);

  const setLine = (idx: number, k: keyof LineForm, v: string) =>
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));

  const handleSave = async () => {
    if (!productId) { toast({ title: "Produk wajib dipilih", variant: "destructive" }); return; }
    const validLines = lines.filter((l) => l.ingredientProductId && Number(l.qty) > 0);
    if (!validLines.length) { toast({ title: "Minimal 1 bahan dengan qty > 0", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onSave({
        productId: Number(productId),
        yieldQty: Number(yieldQty) || 1,
        yieldUnit,
        note: note || null,
        isActive,
        ingredients: validLines.map((l) => ({
          ingredientProductId: Number(l.ingredientProductId),
          qty: Number(l.qty),
          unit: l.unit,
          note: l.note || null,
        })),
      });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Recipe" : "Tambah Recipe / BOM"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Label>Produk Jadi (Minuman)</Label>
              <Select value={productId} onValueChange={setProductId} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Produk yang menggunakan bahan Thai Tea ini</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Yield Qty</Label>
                <Input type="number" min="0.001" step="0.001" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
              </div>
              <div>
                <Label>Satuan</Label>
                <Select value={yieldUnit} onValueChange={setYieldUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YIELD_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Bahan Baku (Ingredients)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, { ...EMPTY_LINE }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Tambah Bahan
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Select value={l.ingredientProductId} onValueChange={(v) => setLine(idx, "ingredientProductId", v)}>
                      <SelectTrigger><SelectValue placeholder="Pilih bahan..." /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Input type="number" min="0.001" step="0.001" placeholder="qty" value={l.qty} onChange={(e) => setLine(idx, "qty", e.target.value)} />
                  </div>
                  <div className="w-24">
                    <Select value={l.unit} onValueChange={(v) => setLine(idx, "unit", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Input placeholder="catatan" value={l.note} onChange={(e) => setLine(idx, "note", e.target.value)} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Catatan</Label>
              <Input placeholder="Opsional..." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktif</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan…" : editing ? "Simpan" : "Tambah"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ThaiTeaRecipesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; editing: Recipe | null }>({ open: false, editing: null });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: recipes = [], isLoading } = useQuery<Recipe[]>({
    queryKey: ["tt-recipes"],
    queryFn: () => apiFetch("/recipes"),
  });
  const { data: products = [] } = useQuery<ThaiTeaProduct[]>({
    queryKey: ["tt-products"],
    queryFn: () => apiFetch("/products"),
  });

  const saveMut = useMutation({
    mutationFn: (data: object) => apiFetch("/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({ title: "Recipe disimpan" });
      qc.invalidateQueries({ queryKey: ["tt-recipes"] });
      setDialog({ open: false, editing: null });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Recipe dihapus" }); qc.invalidateQueries({ queryKey: ["tt-recipes"] }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const filtered = recipes.filter((r) =>
    r.product_name.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (id: number) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ChefHat className="h-6 w-6 text-amber-400" /> Recipe / BOM Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Formula bahan baku per produk minuman Thai Tea. Setiap penjualan POS akan mengurangi bahan sesuai recipe.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["tt-recipes"] })}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setDialog({ open: true, editing: null })}>
              <Plus className="mr-2 h-4 w-4" /> Tambah Recipe
            </Button>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <Input
            placeholder="Cari nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Badge variant="secondary">{filtered.length} recipe</Badge>
        </div>

        {/* Info panel */}
        <Card className="bg-amber-950/20 border-amber-800/30">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <FlaskConical className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">Cara Kerja Recipe / BOM</p>
              <p className="text-muted-foreground mt-0.5">
                Saat kasir menjual produk Thai Tea (product_type = RECIPE), sistem otomatis mengurangi setiap bahan baku
                sesuai qty di recipe ini × jumlah yang dijual. Stok yang berkurang adalah <strong>bahan baku</strong>, bukan produk jadi.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recipe Table */}
        {isLoading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Memuat recipe…</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {recipes.length === 0 ? "Belum ada recipe. Klik \"Tambah Recipe\" untuk memulai." : "Tidak ada recipe yang cocok."}
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <Card key={r.id} className={r.is_active ? "" : "opacity-60"}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggle(r.id)}>
                      <ChefHat className="h-5 w-5 text-amber-400" />
                      <div>
                        <p className="font-semibold">{r.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Yield: {fmt(r.yield_qty)} {r.yield_unit} · {r.ingredients?.length ?? 0} bahan
                          {r.note ? ` · ${r.note}` : ""}
                        </p>
                      </div>
                      <Badge variant={r.is_active ? "default" : "secondary"} className="text-xs">
                        {r.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setDialog({ open: true, editing: r })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => { if (confirm("Hapus recipe ini?")) deleteMut.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {expanded.has(r.id) && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bahan</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Satuan</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(r.ingredients ?? []).map((ing, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{ing.ingredient_name}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(ing.qty)}</TableCell>
                            <TableCell>{ing.unit}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{ing.note ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
                {!expanded.has(r.id) && (
                  <CardContent className="pt-0 pb-3 px-4">
                    <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => toggle(r.id)}>
                      Klik untuk lihat detail bahan ▼
                    </button>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <RecipeDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, editing: null })}
        products={products}
        editing={dialog.editing}
        onSave={(data) => saveMut.mutateAsync(data)}
      />
    </AppShell>
  );
}
