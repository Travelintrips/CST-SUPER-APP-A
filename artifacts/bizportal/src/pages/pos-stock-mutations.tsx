import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";

interface Branch { id: number; name: string; }
interface Mutation {
  id: number; item_name: string; sku: string; unit: string; branch_name: string;
  warehouse_name: string | null; type: string; qty: string; qty_before: string; qty_after: string;
  note: string | null; created_at: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TYPE_LABEL: Record<string, string> = {
  in: "Masuk", out: "Keluar", adjustment: "Penyesuaian",
  transfer_in: "Transfer Masuk", transfer_out: "Transfer Keluar",
  opname: "Opname", order: "Transaksi Kasir",
};

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  in: "default", transfer_in: "default",
  out: "destructive", transfer_out: "destructive",
  adjustment: "secondary", opname: "secondary", order: "outline",
};

export default function PosStockMutationsPage() {
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });

  const params = new URLSearchParams();
  if (filterBranch !== "all") params.set("branchId", filterBranch);
  if (filterType !== "all") params.set("type", filterType);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: mutations = [], isLoading } = useQuery<Mutation[]>({
    queryKey: ["pos-stock-mutations", filterBranch, filterType, dateFrom, dateTo],
    queryFn: () => apiFetch(`/pos-inventory/stock-mutations?${params.toString()}`),
  });

  const totalIn = mutations.filter(m => ["in", "transfer_in"].includes(m.type)).reduce((s, m) => s + Number(m.qty), 0);
  const totalOut = mutations.filter(m => ["out", "transfer_out", "order"].includes(m.type)).reduce((s, m) => s + Math.abs(Number(m.qty)), 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Mutasi Stok</h1>
            <p className="text-sm text-muted-foreground">Riwayat pergerakan stok semua bahan baku</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Masuk</p>
                <p className="text-2xl font-bold text-green-400">+{fmt(totalIn)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
                <TrendingDown className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Keluar</p>
                <p className="text-2xl font-bold text-red-400">-{fmt(totalOut)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Cabang:</Label>
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Cabang</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Tipe:</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Dari:</Label>
            <Input type="date" className="w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Sampai:</Label>
            <Input type="date" className="w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Log Mutasi ({mutations.length} entri)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Bahan Baku</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead className="text-right">Perubahan</TableHead>
                    <TableHead className="text-right">Sblm</TableHead>
                    <TableHead className="text-right">Sesudah</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mutations.map(m => {
                    const isPositive = Number(m.qty) >= 0;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{m.item_name}</div>
                          <div className="text-xs text-muted-foreground">{m.sku}</div>
                        </TableCell>
                        <TableCell className="text-sm">{m.branch_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.warehouse_name ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant={TYPE_VARIANT[m.type] ?? "secondary"} className="text-xs">
                            {TYPE_LABEL[m.type] ?? m.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                          {isPositive ? "+" : ""}{fmt(m.qty)} {m.unit}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">{fmt(m.qty_before)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(m.qty_after)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.note ?? "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {mutations.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Belum ada data mutasi</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
