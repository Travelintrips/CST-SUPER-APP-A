import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Warehouse, AlertTriangle, RefreshCw, Boxes, TrendingUp, Package, ChevronDown, ChevronRight } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number | null | undefined, dec = 3) =>
  Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: dec });

async function apiFetch(path: string) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

interface StockBranch {
  stock_id: number | null;
  branch_id: number;
  branch_name: string;
  business_unit: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  qty: number;
}

interface StockItem {
  item_id: number;
  item_name: string;
  sku: string;
  unit: string;
  cost_price: number;
  total_qty: number;
  branch_count: number;
  branches: StockBranch[];
}

export default function ThaiTeaStockPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: stock = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ["tt-stock"],
    queryFn: () => apiFetch("/stock"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["tt-stock"] });
  const toggle = (id: number) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = stock.filter((s) =>
    s.item_name.toLowerCase().includes(search.toLowerCase()) ||
    s.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = stock.reduce((a, s) => a + s.total_qty * (s.cost_price ?? 0), 0);
  const emptyCount = stock.filter((s) => s.total_qty <= 0).length;
  const totalItems = stock.length;

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Boxes className="h-6 w-6 text-amber-400" /> Stok Bahan Baku Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Inventori bahan baku dari sistem terpadu (pos_inventory_stocks · filter per cabang/gudang)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> Total SKU
              </p>
              <p className="text-2xl font-bold">{totalItems}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> Nilai Stok
              </p>
              <p className="text-xl font-bold text-emerald-400">{idr(totalValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400" /> Stok Habis
              </p>
              <p className={`text-2xl font-bold ${emptyCount > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                {emptyCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Warehouse className="h-3.5 w-3.5" /> Ada Stok
              </p>
              <p className="text-2xl font-bold text-blue-400">{totalItems - emptyCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Daftar Stok Bahan</CardTitle>
              <Input
                placeholder="Cari nama / SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Nama Bahan</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Total Stok</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Harga Pokok</TableHead>
                  <TableHead className="text-right">Nilai Stok</TableHead>
                  <TableHead>Cabang</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat…</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {search ? "Tidak ditemukan." : "Belum ada data stok. Jalankan seed bahan terlebih dahulu."}
                    </TableCell>
                  </TableRow>
                ) : filtered.flatMap((s) => {
                  const isOpen = expanded.has(s.item_id);
                  const subRows = s.branches ?? [];
                  const canExpand = subRows.length > 0;
                  return [
                    <TableRow
                      key={s.item_id}
                      className={s.total_qty <= 0 ? "bg-orange-950/10" : undefined}
                    >
                      <TableCell>
                        {canExpand ? (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => toggle(s.item_id)}
                          >
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {s.total_qty <= 0 && <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />}
                          {s.item_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{s.sku}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={s.total_qty <= 0 ? "text-orange-400" : "text-emerald-400"}>
                          {fmt(s.total_qty)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.unit}</TableCell>
                      <TableCell className="text-right text-xs">{s.cost_price ? idr(s.cost_price) : "—"}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {s.cost_price ? idr(s.total_qty * s.cost_price) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {Number(s.branch_count)} cabang
                        </Badge>
                      </TableCell>
                    </TableRow>,
                    ...(isOpen ? subRows.map((br) => (
                      <TableRow key={`${s.item_id}-${br.branch_id}-${br.warehouse_id ?? "null"}`} className="bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={2} className="pl-8 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="h-3.5 w-3.5 text-amber-400" />
                            <span className="font-medium text-foreground">{br.branch_name}</span>
                            {br.warehouse_name && (
                              <span className="text-muted-foreground">/ {br.warehouse_name}</span>
                            )}
                            {br.business_unit && (
                              <Badge variant="outline" className="text-xs">{br.business_unit}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          <span className={br.qty <= 0 ? "text-orange-400" : "text-emerald-400"}>
                            {fmt(br.qty)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.unit}</TableCell>
                        <TableCell colSpan={3} />
                      </TableRow>
                    )) : []),
                  ];
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
