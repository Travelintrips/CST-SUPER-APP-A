import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Warehouse, RefreshCw, MapPin, CheckCircle } from "lucide-react";

async function apiFetch(path: string) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

interface UnifiedWarehouse {
  id: number;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_type: string;
  is_active: boolean;
  branch_id: number | null;
  branch_name: string | null;
  business_unit: string | null;
}

export default function ThaiTeaBranchesPage() {
  const qc = useQueryClient();

  const { data: warehouses = [], isLoading } = useQuery<UnifiedWarehouse[]>({
    queryKey: ["tt-warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["tt-warehouses"] });

  const byBranch = warehouses.reduce<Record<string, { branchName: string; businessUnit: string | null; warehouses: UnifiedWarehouse[] }>>((acc, w) => {
    const key = w.branch_id != null ? String(w.branch_id) : "global";
    if (!acc[key]) acc[key] = { branchName: w.branch_name ?? "Tanpa Cabang", businessUnit: w.business_unit, warehouses: [] };
    acc[key].warehouses.push(w);
    return acc;
  }, {});

  const totalActive = warehouses.filter((w) => w.is_active).length;

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-amber-400" /> Monitoring Cabang & Gudang
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sistem gudang terpadu — semua operasi stok menggunakan satu sistem gudang (ERP)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Info banner */}
        <Card className="bg-emerald-950/20 border-emerald-800/30">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-emerald-300">Sistem Gudang Terpadu Aktif</p>
              <p className="text-muted-foreground mt-0.5">
                Sistem dual-stock sync telah dihapus. Semua operasi stok (POS kasir, penerimaan bahan,
                transfer, opname) kini menggunakan satu tabel <code className="text-xs bg-muted px-1 rounded">warehouses</code> secara
                langsung — tidak ada lagi mapping POS ↔ ERP.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Gudang Aktif</p>
              <p className="text-2xl font-bold text-emerald-400">{totalActive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Cabang</p>
              <p className="text-2xl font-bold">{Object.keys(byBranch).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Gudang</p>
              <p className="text-2xl font-bold">{warehouses.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Warehouses per branch */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Warehouse className="h-4 w-4" /> Daftar Gudang per Cabang
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Memuat…</TableCell>
                  </TableRow>
                ) : warehouses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Belum ada gudang terdaftar.
                    </TableCell>
                  </TableRow>
                ) : warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4 text-amber-400" />
                        <span className="font-medium">{w.warehouse_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{w.warehouse_code}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {w.branch_name ? (
                          <>
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{w.branch_name}</span>
                            {w.business_unit && (
                              <Badge variant="secondary" className="text-xs">{w.business_unit}</Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">Global</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{w.warehouse_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.is_active ? "default" : "secondary"} className="text-xs">
                        {w.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
