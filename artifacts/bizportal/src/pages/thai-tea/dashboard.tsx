import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Package, AlertTriangle, ChefHat, TrendingUp, Boxes,
  GitBranch, ArrowLeftRight, Activity, BarChart2, FlaskConical,
  RefreshCw, ShoppingBag,
} from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number | null | undefined, dec = 2) =>
  Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: dec });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

async function apiFetch(path: string) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

interface StockItem { product_id: number; product_name: string; sku: string; unit: string; total_qty: number; avg_cost: number | null; }
interface Recipe { id: number; product_name: string; is_active: boolean; ingredients: unknown[] | null; }
interface Movement { id: number; type: string; qty: number; product_name: string; unit: string; warehouse_name: string | null; branch_name: string | null; note: string | null; created_at: string; }

const movTypeLabel: Record<string, string> = {
  po_receipt: "Terima PO",
  production_consumption: "Produksi",
  thai_tea_receive: "Terima Bahan",
  adjustment: "Penyesuaian",
};
const movTypeBadge = (t: string) => {
  if (t === "po_receipt" || t === "thai_tea_receive") return "default";
  if (t === "production_consumption") return "destructive";
  return "secondary";
};

const QUICK_LINKS = [
  { href: "/thai-tea/recipes", icon: ChefHat, label: "Recipe / BOM", desc: "Kelola formula produk Thai Tea" },
  { href: "/thai-tea/stock", icon: Boxes, label: "Stok Bahan Baku", desc: "Monitor stok POS & ERP" },
  { href: "/thai-tea/branches", icon: GitBranch, label: "Monitoring Cabang", desc: "Link gudang POS ↔ ERP" },
  { href: "/thai-tea/production", icon: FlaskConical, label: "Produksi / Racikan", desc: "Catat produksi & konsumsi bahan" },
  { href: "/thai-tea/reports", icon: BarChart2, label: "Laporan", desc: "Riwayat mutasi stok bahan" },
  { href: "/purchase/thai-tea", icon: ShoppingBag, label: "Pembelian Bahan", desc: "PO & penerimaan bahan baku" },
];

export default function ThaiTeaDashboardPage() {
  const { data: stocks = [], isLoading: stockLoading, refetch: refetchStock } = useQuery<StockItem[]>({
    queryKey: ["tt-dash-stock"],
    queryFn: () => apiFetch("/stock"),
  });
  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["tt-dash-recipes"],
    queryFn: () => apiFetch("/recipes"),
  });
  const { data: movements = [], isLoading: movLoading } = useQuery<Movement[]>({
    queryKey: ["tt-dash-movements"],
    queryFn: () => apiFetch("/movements?limit=10"),
  });

  const totalValue = stocks.reduce((a, s) => a + s.total_qty * (s.avg_cost ?? 0), 0);
  const emptyStock = stocks.filter((s) => s.total_qty <= 0);
  const lowStock = stocks.filter((s) => s.total_qty > 0 && s.total_qty < 10);
  const activeRecipes = recipes.filter((r) => r.is_active);

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ChefHat className="h-6 w-6 text-amber-400" /> Thai Tea CST — Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Overview operasional Thai Tea: bahan baku, recipe, stok, dan pergerakan
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetchStock(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Jenis Bahan</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stockLoading ? "…" : stocks.length}</p>
              <p className="text-xs text-muted-foreground">produk bahan baku aktif</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Stok Kosong / Kritis</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${emptyStock.length > 0 ? "text-red-400" : lowStock.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {emptyStock.length + lowStock.length}
              </p>
              <p className="text-xs text-muted-foreground">{emptyStock.length} habis · {lowStock.length} hampir habis</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Recipe Aktif</CardTitle>
              <ChefHat className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{activeRecipes.length}</p>
              <p className="text-xs text-muted-foreground">dari {recipes.length} recipe terdaftar</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Nilai Stok</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-400">{idr(totalValue)}</p>
              <p className="text-xs text-muted-foreground">estimasi nilai inventori</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Menu Thai Tea CST</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {QUICK_LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
                  <CardContent className="pt-4 pb-4 flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-amber-400/10 p-2">
                      <l.icon className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{l.label}</p>
                      <p className="text-xs text-muted-foreground">{l.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low / Empty stock alert */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Alert Stok Bahan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stockLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Memuat…</p>
              ) : emptyStock.length === 0 && lowStock.length === 0 ? (
                <p className="text-sm text-emerald-400 py-4 text-center">Semua bahan stok mencukupi ✓</p>
              ) : (
                <div className="space-y-2">
                  {[...emptyStock, ...lowStock].slice(0, 8).map((s) => (
                    <div key={s.product_id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-3.5 w-3.5 ${s.total_qty <= 0 ? "text-red-400" : "text-amber-400"}`} />
                        <span className="text-sm font-medium">{s.product_name}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${s.total_qty <= 0 ? "text-red-400" : "text-amber-400"}`}>
                          {fmt(s.total_qty, 3)} {s.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/thai-tea/stock">
                <Button variant="ghost" size="sm" className="w-full mt-3">Lihat Semua Stok →</Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent movements */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Mutasi Stok Terbaru
              </CardTitle>
            </CardHeader>
            <CardContent>
              {movLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Memuat…</p>
              ) : movements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Belum ada mutasi stok</p>
              ) : (
                <div className="space-y-2">
                  {movements.slice(0, 7).map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={movTypeBadge(m.type) as "default" | "destructive" | "secondary"} className="text-[10px] px-1.5 py-0">
                            {movTypeLabel[m.type] ?? m.type}
                          </Badge>
                          <span className="text-sm font-medium truncate">{m.product_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.warehouse_name ?? "—"} · {fmtDate(m.created_at)}
                        </p>
                      </div>
                      <span className={`text-sm font-bold ml-2 ${Number(m.qty) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {Number(m.qty) >= 0 ? "+" : ""}{fmt(m.qty, 3)} {m.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/thai-tea/reports">
                <Button variant="ghost" size="sm" className="w-full mt-3">Lihat Semua Mutasi →</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
