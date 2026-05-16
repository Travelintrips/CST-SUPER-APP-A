import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Boxes, Warehouse, AlertTriangle, TrendingDown } from "lucide-react";

interface StockSummary {
  product_id: number; product_name: string; sku: string; unit: string;
  total_qty: number; avg_cost_price: number; warehouse_count: number;
}
interface StockRow {
  id: number; product_id: number; product_name: string; sku: string; unit: string;
  warehouse_id: number; warehouse_name: string; branch_name: string;
  rack_code: string | null; rack_name: string | null; qty: number; cost_price: number;
}
interface Wh { id: number; name: string; branch_name: string; }

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
const fmtCurr = (n: number) => "Rp " + Number(n).toLocaleString("id-ID");

export default function WarehouseStockPage() {
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"summary" | "detail">("summary");

  const { data: warehouses = [] } = useQuery<Wh[]>({
    queryKey: ["wh-warehouses"],
    queryFn: () => apiFetch("/warehouse/warehouses"),
  });

  const { data: summary = [], isLoading: summaryLoading } = useQuery<StockSummary[]>({
    queryKey: ["wh-stock-summary"],
    queryFn: () => apiFetch("/warehouse/stock/summary"),
    enabled: view === "summary",
  });

  const { data: detail = [], isLoading: detailLoading } = useQuery<StockRow[]>({
    queryKey: ["wh-stock-detail", warehouseId],
    queryFn: () => apiFetch(`/warehouse/stock${warehouseId !== "all" ? `?warehouseId=${warehouseId}` : ""}`),
    enabled: view === "detail",
  });

  const summaryFiltered = summary.filter(s =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase())
  );
  const detailFiltered = detail.filter(s =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalProducts = summary.length;
  const zeroStock = summary.filter(s => s.total_qty <= 0).length;
  const totalValue = summary.reduce((acc, s) => acc + s.total_qty * s.avg_cost_price, 0);

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes size={24} /> Stok Gudang</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview stok per produk di semua gudang</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total Produk</p>
              <p className="text-2xl font-bold">{totalProducts}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle size={14} className="text-red-500" /> Stok Habis / 0</p>
              <p className="text-2xl font-bold text-red-500">{zeroStock}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Estimasi Nilai Stok</p>
              <p className="text-2xl font-bold">{fmtCurr(totalValue)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Cari produk / SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={view} onValueChange={v => setView(v as "summary" | "detail")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Ringkasan</SelectItem>
              <SelectItem value="detail">Per Gudang</SelectItem>
            </SelectContent>
          </Select>
          {view === "detail" && (
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Semua Gudang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Gudang</SelectItem>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>
                ))}
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
                    <TableHead className="text-right">Harga Pokok</TableHead>
                    <TableHead className="text-right">Nilai Stok</TableHead>
                    <TableHead className="text-center">Gudang</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                  ) : summaryFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Tidak ada data stok</TableCell></TableRow>
                  ) : summaryFiltered.map(s => (
                    <TableRow key={s.product_id}>
                      <TableCell className="font-medium">{s.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(s.total_qty)}</TableCell>
                      <TableCell>{s.unit}</TableCell>
                      <TableCell className="text-right text-sm">{fmtCurr(s.avg_cost_price)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtCurr(s.total_qty * s.avg_cost_price)}</TableCell>
                      <TableCell className="text-center">{s.warehouse_count}</TableCell>
                      <TableCell>
                        {s.total_qty <= 0
                          ? <Badge variant="destructive">Habis</Badge>
                          : s.total_qty < 5
                          ? <Badge variant="outline" className="border-yellow-500 text-yellow-600">Hampir Habis</Badge>
                          : <Badge variant="outline" className="border-green-500 text-green-600">Tersedia</Badge>
                        }
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
                  {detailLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                  ) : detailFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Tidak ada data stok</TableCell></TableRow>
                  ) : detailFiltered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{s.branch_name}</TableCell>
                      <TableCell>{s.warehouse_name}</TableCell>
                      <TableCell className="text-xs">{s.rack_code ? `${s.rack_code} - ${s.rack_name}` : "-"}</TableCell>
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
      </div>
    </AppShell>
  );
}
