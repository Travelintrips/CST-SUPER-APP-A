import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play, CheckCircle, AlertTriangle, RefreshCw, Warehouse } from "lucide-react";

const fmt = (n: number | null | undefined, dec = 3) =>
  Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: dec });

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include", ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any)?.message ?? `Error ${res.status}`); }
  return res.json();
}

interface Ingredient { ingredient_product_id: number; ingredient_name: string; unit: string; qty: number; }
interface Recipe { id: number; product_id: number; product_name: string; yield_qty: number; yield_unit: string; is_active: boolean; ingredients: Ingredient[] | null; }
interface PosWarehouse { id: number; name: string; branch_name: string | null; }
interface Deduction { ingredientName: string; unit: string; requiredQty: number; deductedQty: number; whBefore: number; whAfter: number; }
interface ProductionResult {
  batchId: string; recipeId: number; productName: string; qty: number; posWarehouseId: number;
  deductions: Deduction[]; message: string;
}

export default function ThaiTeaProductionPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState("1");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lastResult, setLastResult] = useState<ProductionResult | null>(null);

  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["tt-recipes"],
    queryFn: () => apiFetch("/recipes"),
    select: (d) => d.filter((r) => r.is_active),
  });
  const { data: posWhs = [] } = useQuery<PosWarehouse[]>({
    queryKey: ["tt-pos-whs"],
    queryFn: () => apiFetch("/warehouses"),
  });

  const selectedRecipe = recipes.find((r) => r.id === Number(recipeId));

  const prodMut = useMutation({
    mutationFn: (data: object) => apiFetch("/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: (result: ProductionResult) => {
      toast({ title: "Produksi Dicatat", description: result.message });
      setLastResult(result);
      qc.invalidateQueries({ queryKey: ["tt-stock-pos"] });
      qc.invalidateQueries({ queryKey: ["tt-dash-movements"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!recipeId || !warehouseId || !qty || Number(qty) <= 0) {
      toast({ title: "Recipe, gudang, dan qty wajib diisi", variant: "destructive" });
      return;
    }
    prodMut.mutate({
      recipeId: Number(recipeId),
      qty: Number(qty),
      posWarehouseId: Number(warehouseId),
      notes: notes || undefined,
    });
  };

  const previewIngredients = selectedRecipe?.ingredients?.map((ing) => ({
    ...ing,
    requiredQty: ing.qty * Number(qty || 0),
  })) ?? [];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-amber-400" /> Produksi / Racikan Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Catat produksi minuman Thai Tea. Bahan baku otomatis berkurang sesuai recipe / BOM.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLastResult(null)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Produksi */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> Form Catatan Produksi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Produk / Recipe</Label>
                <Select value={recipeId} onValueChange={(v) => { setRecipeId(v); setLastResult(null); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih recipe aktif..." />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.length === 0 ? (
                      <SelectItem value="__none" disabled>Belum ada recipe aktif</SelectItem>
                    ) : recipes.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.product_name} (yield: {fmt(r.yield_qty)} {r.yield_unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Jumlah Produksi</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => { setQty(e.target.value); setLastResult(null); }}
                    placeholder="1"
                  />
                  {selectedRecipe && (
                    <p className="text-xs text-muted-foreground mt-1">
                      = {fmt(Number(qty || 0) * selectedRecipe.yield_qty)} {selectedRecipe.yield_unit}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Gudang POS</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                    <SelectContent>
                      {posWhs.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name} {w.branch_name ? `(${w.branch_name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Catatan (opsional)</Label>
                <Input
                  placeholder="cth: Batch pagi, event weekend, dll."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={prodMut.isPending || !recipeId || !warehouseId}
              >
                {prodMut.isPending ? (
                  <span className="animate-pulse">Memproses…</span>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> Catat Produksi
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Produksi akan mengurangi stok bahan baku dari gudang POS yang dipilih.
                Jika gudang terhubung ke ERP (via warehouse link), stok ERP juga diperbarui.
              </p>
            </CardContent>
          </Card>

          {/* Preview Bahan */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Warehouse className="h-4 w-4" />
                {lastResult ? "Hasil Produksi" : "Preview Konsumsi Bahan"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lastResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-950/20 border border-emerald-800/30">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                    <div>
                      <p className="font-medium text-emerald-300">{lastResult.message}</p>
                      <p className="text-xs text-muted-foreground">Batch ID: {lastResult.batchId}</p>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bahan</TableHead>
                        <TableHead className="text-right">Dikurangi</TableHead>
                        <TableHead className="text-right">Stok Sisa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lastResult.deductions.map((d, i) => (
                        <TableRow key={i} className={d.whBefore < d.requiredQty ? "bg-amber-950/10" : ""}>
                          <TableCell className="font-medium">{d.ingredientName}</TableCell>
                          <TableCell className="text-right text-red-400 font-mono">
                            -{fmt(d.requiredQty)} {d.unit}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={d.whAfter <= 0 ? "text-red-400" : d.whAfter < 5 ? "text-amber-400" : "text-emerald-400"}>
                              {fmt(d.whAfter)} {d.unit}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setLastResult(null); setRecipeId(""); setQty("1"); setNotes(""); }}>
                    ← Produksi Baru
                  </Button>
                </div>
              ) : selectedRecipe && previewIngredients.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Produksi <strong>{qty || 0}×</strong> {selectedRecipe.product_name} akan mengkonsumsi:
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bahan</TableHead>
                        <TableHead className="text-right">Per Recipe</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Satuan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewIngredients.map((ing, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{ing.ingredient_name}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(ing.qty)}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-amber-400">{fmt(ing.requiredQty)}</TableCell>
                          <TableCell>{ing.unit}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Pilih recipe dan isi qty untuk melihat preview konsumsi bahan baku
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info panel */}
        <Card className="bg-amber-950/20 border-amber-800/30">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">Penting: Kapan menggunakan Produksi Manual?</p>
              <p className="text-muted-foreground mt-0.5">
                Halaman ini untuk produksi <strong>di luar transaksi POS</strong>, misalnya: batch produksi massal, event,
                atau koreksi stok bahan. Untuk penjualan kasir sehari-hari, bahan baku berkurang otomatis saat kasir
                menyelesaikan transaksi POS — tidak perlu input manual di sini.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
