import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Warehouse, AlertTriangle, RefreshCw, Boxes, TrendingUp, Package } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number | null | undefined, dec = 3) =>
  Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: dec });

async function apiFetch(path: string) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

interface WhStockItem {
  product_id: number; product_name: string; sku: string; unit: string;
  total_qty: number; avg_cost: number | null; warehouse_count: number;
  warehouses: Array<{ warehouse_id: number; warehouse_name: string; branch_name: string; qty: number; cost_price: number }> | null;
}
interface ErpStockItem {
  product_id: number; product_name: string; sku: string; unit: string;
  total_on_hand: number; total_available: number; avg_cost: number | null;
  erp_warehouses: Array<{ warehouse_id: number; warehouse_name: string; warehouse_code: string; stock_on_hand: number; stock_available: number }> | null;
}

export default function ThaiTeaStockPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedPos, setExpandedPos] = useState<Set<number>>(new Set());
  const [expandedErp, setExpandedErp] = useState<Set<number>>(new Set());

  const { data: posStock = [], isLoading: posLoading } = useQuery<WhStockItem[]>({
    queryKey: ["tt-stock-pos"],
    queryFn: () => apiFetch("/stock"),
  });
  const { data: erpStock = [], isLoading: erpLoading } = useQuery<ErpStockItem[]>({
    queryKey: ["tt-stock-erp"],
    queryFn: () => apiFetch("/inventory-stock"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tt-stock-pos"] });
    qc.invalidateQueries({ queryKey: ["tt-stock-erp"] });
  };

  const togglePos = (id: number) => setExpandedPos((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleErp = (id: number) => setExpandedErp((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const posFiltered = posStock.filter((s) =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase())
  );
  const erpFiltered = erpStock.filter((s) =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase())
  );

  const posValue = posStock.reduce((a, s) => a + s.total_qty * (s.avg_cost ?? 0), 0);
  const erpValue = erpStock.reduce((a, s) => a + s.total_on_hand * (s.avg_cost ?? 0), 0);
  const posEmpty = posStock.filter((s) => s.total_qty <= 0).length;
  const erpEmpty = erpStock.filter((s) => s.total_on_hand <= 0).length;

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Boxes className="h-6 w-6 text-amber-400" /> Stok Bahan Baku Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor stok bahan baku di sistem POS (wh_stock) dan ERP (inventory_stock)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Jenis Bahan (POS)</p></div>
              <p className="text-2xl font-bold">{posStock.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-red-400" /><p className="text-xs text-muted-foreground">Kosong (POS)</p></div>
              <p className={`text-2xl font-bold ${posEmpty > 0 ? "text-red-400" : "text-emerald-400"}`}>{posEmpty}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-emerald-400" /><p className="text-xs text-muted-foreground">Nilai Stok POS</p></div>
              <p className="text-xl font-bold text-emerald-400">{idr(posValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-blue-400" /><p className="text-xs text-muted-foreground">Nilai Stok ERP</p></div>
              <p className="text-xl font-bold text-blue-400">{idr(erpValue)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3 items-center">
          <Input
            placeholder="Cari nama atau SKU bahan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <Tabs defaultValue="pos">
          <TabsList>
            <TabsTrigger value="pos">Stok POS (wh_stock)</TabsTrigger>
            <TabsTrigger value="erp">Stok ERP (inventory_stock)</TabsTrigger>
          </TabsList>

          {/* POS STOCK */}
          <TabsContent value="pos" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Stok ini dikelola sistem POS. Berkurang saat kasir jual produk RECIPE, bertambah saat terima bahan.
            </p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Bahan</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Total Stok</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Harga Rata-rata</TableHead>
                      <TableHead className="text-right">Nilai Stok</TableHead>
                      <TableHead>Gudang</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Memuat…</TableCell></TableRow>
                    ) : posFiltered.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {posStock.length === 0 ? "Belum ada data stok. Terima bahan Thai Tea untuk memperbarui stok." : "Tidak ada hasil."}
                      </TableCell></TableRow>
                    ) : posFiltered.map((s) => (
                      <>
                        <TableRow
                          key={s.product_id}
                          className={`cursor-pointer hover:bg-muted/30 ${s.total_qty <= 0 ? "bg-red-950/10" : ""}`}
                          onClick={() => togglePos(s.product_id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {s.total_qty <= 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                              {s.product_name}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                          <TableCell className={`text-right font-bold ${s.total_qty <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                            {fmt(s.total_qty)}
                          </TableCell>
                          <TableCell>{s.unit}</TableCell>
                          <TableCell className="text-right">{s.avg_cost ? idr(s.avg_cost) : "—"}</TableCell>
                          <TableCell className="text-right">{idr(s.total_qty * (s.avg_cost ?? 0))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{s.warehouse_count}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedPos.has(s.product_id) && s.warehouses?.map((wh, i) => (
                          <TableRow key={`${s.product_id}-wh-${i}`} className="bg-muted/10">
                            <TableCell />
                            <TableCell colSpan={2} className="text-xs text-muted-foreground pl-8">
                              <Warehouse className="h-3 w-3 inline mr-1" />
                              {wh.warehouse_name} {wh.branch_name ? `(${wh.branch_name})` : ""}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">{fmt(wh.qty)}</TableCell>
                            <TableCell>{s.unit}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{idr(wh.cost_price)} / {s.unit}</TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ERP STOCK */}
          <TabsContent value="erp" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Stok ERP diperbarui saat "Terima Bahan" via modul Thai Tea Pembelian. Sumber data: inventory_stock.
            </p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Bahan</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Stok On Hand</TableHead>
                      <TableHead className="text-right">Tersedia</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Nilai Stok</TableHead>
                      <TableHead>Gudang</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {erpLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Memuat…</TableCell></TableRow>
                    ) : erpFiltered.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {erpStock.length === 0 ? "Belum ada data stok ERP. Gunakan Terima Bahan dengan ERP warehouse." : "Tidak ada hasil."}
                      </TableCell></TableRow>
                    ) : erpFiltered.map((s) => (
                      <>
                        <TableRow
                          key={s.product_id}
                          className={`cursor-pointer hover:bg-muted/30 ${s.total_on_hand <= 0 ? "bg-red-950/10" : ""}`}
                          onClick={() => toggleErp(s.product_id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {s.total_on_hand <= 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                              {s.product_name}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                          <TableCell className={`text-right font-bold ${s.total_on_hand <= 0 ? "text-red-400" : "text-blue-400"}`}>
                            {fmt(s.total_on_hand)}
                          </TableCell>
                          <TableCell className="text-right">{fmt(s.total_available)}</TableCell>
                          <TableCell>{s.unit}</TableCell>
                          <TableCell className="text-right">{idr(s.total_on_hand * (s.avg_cost ?? 0))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{s.erp_warehouses?.length ?? 0}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedErp.has(s.product_id) && s.erp_warehouses?.map((wh, i) => (
                          <TableRow key={`${s.product_id}-erp-${i}`} className="bg-muted/10">
                            <TableCell />
                            <TableCell colSpan={2} className="text-xs text-muted-foreground pl-8">
                              <Warehouse className="h-3 w-3 inline mr-1" />
                              [{wh.warehouse_code}] {wh.warehouse_name}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">{fmt(wh.stock_on_hand)}</TableCell>
                            <TableCell className="text-right text-sm">{fmt(wh.stock_available)}</TableCell>
                            <TableCell>{s.unit}</TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
