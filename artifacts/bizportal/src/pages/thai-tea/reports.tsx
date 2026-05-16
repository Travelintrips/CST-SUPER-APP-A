import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart2, RefreshCw, Activity, TrendingDown, TrendingUp, Package } from "lucide-react";

const fmt = (n: number | null | undefined, dec = 3) =>
  Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: dec });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function apiFetch(path: string) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

interface Movement {
  id: number; type: string; qty: number; qty_before: number; qty_after: number;
  cost_price: number; ref_type: string | null; ref_id: number | null;
  note: string | null; created_at: string;
  product_name: string; product_sku: string; unit: string;
  warehouse_name: string | null; branch_name: string | null;
}
interface ThaiTeaProduct { id: number; name: string; sku: string; }

const MOV_TYPES = [
  { value: "all", label: "Semua Tipe" },
  { value: "po_receipt", label: "Terima PO" },
  { value: "thai_tea_receive", label: "Terima Bahan" },
  { value: "pos_sale", label: "Jual POS" },
  { value: "production_consumption", label: "Konsumsi Produksi" },
  { value: "adjustment", label: "Penyesuaian" },
];
const movTypeLabel: Record<string, string> = {
  po_receipt: "Terima PO", thai_tea_receive: "Terima Bahan",
  pos_sale: "Jual POS", production_consumption: "Produksi",
  adjustment: "Penyesuaian",
};
const movBadgeVariant = (t: string): "default" | "destructive" | "secondary" | "outline" => {
  if (t === "po_receipt" || t === "thai_tea_receive") return "default";
  if (t === "pos_sale" || t === "production_consumption") return "destructive";
  if (t === "adjustment") return "outline";
  return "secondary";
};

export default function ThaiTeaReportsPage() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("200");

  const queryParams = new URLSearchParams();
  queryParams.set("limit", limit);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (productFilter !== "all") queryParams.set("product_id", productFilter);

  const { data: movements = [], isLoading } = useQuery<Movement[]>({
    queryKey: ["tt-movements", typeFilter, productFilter, limit],
    queryFn: () => apiFetch(`/movements?${queryParams}`),
  });
  const { data: products = [] } = useQuery<ThaiTeaProduct[]>({
    queryKey: ["tt-products"],
    queryFn: () => apiFetch("/products"),
  });

  const filtered = movements.filter((m) =>
    !search ||
    m.product_name.toLowerCase().includes(search.toLowerCase()) ||
    m.product_sku.toLowerCase().includes(search.toLowerCase()) ||
    (m.note ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalIn = movements.filter((m) => Number(m.qty) > 0).reduce((a, m) => a + Math.abs(Number(m.qty)), 0);
  const totalOut = movements.filter((m) => Number(m.qty) < 0).reduce((a, m) => a + Math.abs(Number(m.qty)), 0);

  const refresh = () => qc.invalidateQueries({ queryKey: ["tt-movements"] });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-amber-400" /> Laporan Mutasi Stok Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Riwayat pergerakan stok bahan baku Thai Tea: penerimaan, penjualan POS, produksi, dan penyesuaian
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Total Mutasi</p>
              </div>
              <p className="text-2xl font-bold">{movements.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <p className="text-xs text-muted-foreground">Total Masuk</p>
              </div>
              <p className="text-2xl font-bold text-emerald-400">+{fmt(totalIn)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-red-400" />
                <p className="text-xs text-muted-foreground">Total Keluar</p>
              </div>
              <p className="text-2xl font-bold text-red-400">-{fmt(totalOut)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Produk Terlibat</p>
              </div>
              <p className="text-2xl font-bold">{new Set(movements.map((m) => m.product_name)).size}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">Tipe Mutasi</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOV_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Produk</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Produk</SelectItem>
                    {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Limit</Label>
                <Select value={limit} onValueChange={setLimit}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 data</SelectItem>
                    <SelectItem value="100">100 data</SelectItem>
                    <SelectItem value="200">200 data</SelectItem>
                    <SelectItem value="500">500 data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-36">
                <Label className="text-xs">Cari</Label>
                <Input
                  placeholder="Nama, SKU, atau catatan..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Badge variant="secondary" className="mb-0.5">{filtered.length} baris</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Movements Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Sblm</TableHead>
                    <TableHead className="text-right">Sesudah</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Memuat…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Tidak ada data mutasi {typeFilter !== "all" ? `tipe "${movTypeLabel[typeFilter] ?? typeFilter}"` : ""}.
                    </TableCell></TableRow>
                  ) : filtered.map((m) => (
                    <TableRow key={m.id} className="text-sm">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={movBadgeVariant(m.type)} className="text-xs whitespace-nowrap">
                          {movTypeLabel[m.type] ?? m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium max-w-[160px] truncate">{m.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{m.product_sku}</TableCell>
                      <TableCell className={`text-right font-bold ${Number(m.qty) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {Number(m.qty) >= 0 ? "+" : ""}{fmt(m.qty)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(m.qty_before)}</TableCell>
                      <TableCell className="text-right">{fmt(m.qty_after)}</TableCell>
                      <TableCell>{m.unit}</TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <span>{m.warehouse_name ?? "—"}</span>
                          {m.branch_name && <span className="text-muted-foreground"> ({m.branch_name})</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={m.note ?? undefined}>
                        {m.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
