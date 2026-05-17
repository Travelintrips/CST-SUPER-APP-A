import { AppShell } from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowLeftRight, Boxes, Package, RefreshCw, TrendingDown, TrendingUp, Warehouse, Activity } from "lucide-react";
import { Link } from "wouter";

interface DashboardData {
  summary: { lowStockCount: number; pendingTransfers: number; lossCount7d: number };
  stockByWarehouse: { warehouse_name: string; branch_name: string; item_count: string; total_qty: string }[];
  lowStockItems: { item_name: string; sku: string; unit: string; min_stock: string; branch_name: string; total_qty: string; shortage: string }[];
  transferByStatus: Record<string, number>;
  recentLosses: { loss_type: string; item_name: string; unit: string; branch_name: string; reason: string; created_at: string; total_qty: string }[];
  recentMutations: { type: string; qty: string; qty_after: string; item_name: string; unit: string; branch_name: string; note: string; created_at: string }[];
  posOrdersToday: { cnt: string; total_revenue: string };
}

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 1 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const LOSS_COLOR: Record<string, string> = { damaged: "text-red-500", lost: "text-orange-500", expired: "text-yellow-500" };
const LOSS_LABEL: Record<string, string> = { damaged: "Rusak", lost: "Hilang", expired: "Kadaluarsa" };

const MUTATION_ICON: Record<string, typeof TrendingUp> = {};
function MutQty({ qty }: { qty: string }) {
  const n = Number(qty);
  return <span className={n >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>{n >= 0 ? "+" : ""}{fmt(n)}</span>;
}

const STATUS_ORDER = ["draft", "pending", "in_transit", "received", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = { draft: "Draft", pending: "Menunggu", in_transit: "Dikirim", received: "Diterima", cancelled: "Batal" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = { draft: "secondary", pending: "outline", in_transit: "default", received: "outline", cancelled: "destructive" };

export default function PosInventoryDashboardPage() {
  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["pos-inventory-dashboard"],
    queryFn: () => apiFetch("/pos-inventory/dashboard"),
    refetchInterval: 60000,
  });

  if (isLoading) return (
    <AppShell>
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </AppShell>
  );

  const d = data!;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Boxes className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Dashboard Inventory</h1>
              <p className="text-sm text-muted-foreground">Real-time stok, alert, dan mutasi</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Stok Rendah</p>
                  <p className="text-3xl font-bold text-orange-500 mt-1">{d.summary.lowStockCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">item di bawah minimum</p>
                </div>
                <div className="p-2 rounded-lg bg-orange-50"><AlertTriangle className="h-5 w-5 text-orange-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Transfer Aktif</p>
                  <p className="text-3xl font-bold text-blue-500 mt-1">{d.summary.pendingTransfers}</p>
                  <p className="text-xs text-muted-foreground mt-1">pending + in transit</p>
                </div>
                <div className="p-2 rounded-lg bg-blue-50"><ArrowLeftRight className="h-5 w-5 text-blue-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Kerugian 7 Hari</p>
                  <p className="text-3xl font-bold text-red-500 mt-1">{d.summary.lossCount7d}</p>
                  <p className="text-xs text-muted-foreground mt-1">catatan rusak/hilang</p>
                </div>
                <div className="p-2 rounded-lg bg-red-50"><TrendingDown className="h-5 w-5 text-red-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">POS Hari Ini</p>
                  <p className="text-3xl font-bold text-emerald-500 mt-1">{d.posOrdersToday?.cnt ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rp {Number(d.posOrdersToday?.total_revenue ?? 0).toLocaleString("id-ID")}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stok Per Gudang */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Warehouse className="h-4 w-4" /> Stok Per Gudang
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Item</TableHead>
                    <TableHead className="text-right">Total Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.stockByWarehouse.map((w, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{w.warehouse_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.branch_name}</TableCell>
                      <TableCell className="text-right text-sm">{w.item_count}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(w.total_qty)}</TableCell>
                    </TableRow>
                  ))}
                  {d.stockByWarehouse.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Belum ada data stok</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Transfer Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" /> Status Transfer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {STATUS_ORDER.map(s => (
                  <div key={s} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABEL[s]}</Badge>
                    </div>
                    <span className="text-2xl font-bold">{d.transferByStatus[s] ?? 0}</span>
                  </div>
                ))}
              </div>
              <Button asChild variant="outline" size="sm" className="w-full mt-3 gap-2">
                <Link href="/pos-inventory/transfers">Lihat Semua Transfer</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert */}
        {d.lowStockItems.length > 0 && (
          <Card className="border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-4 w-4" /> Alert Stok Rendah ({d.lowStockItems.length} item)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">Min.</TableHead>
                    <TableHead className="text-right">Kekurangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.lowStockItems.slice(0, 10).map((item, i) => (
                    <TableRow key={i} className="bg-orange-50/30">
                      <TableCell className="font-medium text-sm">{item.item_name} <span className="text-xs text-muted-foreground">({item.unit})</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.branch_name}</TableCell>
                      <TableCell className="text-right text-red-500 font-medium">{fmt(item.total_qty)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmt(item.min_stock)}</TableCell>
                      <TableCell className="text-right text-orange-600 font-bold">{fmt(item.shortage)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Kerugian Terbaru */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" /> Kerugian 7 Hari Terakhir
              </CardTitle>
            </CardHeader>
            <CardContent>
              {d.recentLosses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Tidak ada kerugian 7 hari ini</p>
              ) : (
                <div className="space-y-2">
                  {d.recentLosses.slice(0, 8).map((l, i) => (
                    <div key={i} className="flex items-start justify-between text-sm border-b pb-2 last:border-0">
                      <div>
                        <span className={`font-medium ${LOSS_COLOR[l.loss_type] ?? "text-foreground"}`}>{LOSS_LABEL[l.loss_type] ?? l.loss_type}</span>
                        <span className="mx-1">·</span>
                        <span>{l.item_name}</span>
                        <span className="text-muted-foreground text-xs ml-1">({l.branch_name})</span>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{l.reason}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-medium text-red-500">-{fmt(l.total_qty)} {l.unit}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button asChild variant="outline" size="sm" className="w-full mt-3">
                <Link href="/pos-inventory/losses">Lihat Semua Kerugian</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Mutasi Terbaru */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Mutasi Stok Terbaru
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {d.recentMutations.slice(0, 8).map((m, i) => (
                  <div key={i} className="flex items-start justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <span className="font-mono text-xs bg-muted px-1 rounded">{m.type}</span>
                      <span className="ml-2">{m.item_name}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.branch_name} · {m.note || "-"}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <MutQty qty={m.qty} />
                      <p className="text-xs text-muted-foreground">{fmtDate(m.created_at)}</p>
                    </div>
                  </div>
                ))}
                {d.recentMutations.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Belum ada mutasi</p>}
              </div>
              <Button asChild variant="outline" size="sm" className="w-full mt-3">
                <Link href="/pos-inventory/mutations">Lihat Semua Mutasi</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
