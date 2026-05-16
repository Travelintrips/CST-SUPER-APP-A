import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

interface Movement {
  id: number; product_name: string; sku: string; unit: string;
  warehouse_name: string; type: string; qty: number; qty_before: number; qty_after: number;
  cost_price: number; ref_type: string | null; ref_id: number | null; note: string | null;
  created_at: string;
}
interface Wh { id: number; name: string; branch_name: string; }

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  po_receipt: { label: "Terima PO", color: "bg-green-500" },
  so_delivery: { label: "Kirim SO", color: "bg-blue-500" },
  pos_sale: { label: "Jual POS", color: "bg-purple-500" },
  transfer_in: { label: "Transfer Masuk", color: "bg-teal-500" },
  transfer_out: { label: "Transfer Keluar", color: "bg-orange-500" },
  opname_adjust: { label: "Opname", color: "bg-yellow-500" },
  damage: { label: "Rusak/Hilang", color: "bg-red-500" },
  return_in: { label: "Retur Masuk", color: "bg-green-400" },
  return_out: { label: "Retur Keluar", color: "bg-red-400" },
  manual_in: { label: "Manual Masuk", color: "bg-gray-400" },
  manual_out: { label: "Manual Keluar", color: "bg-gray-600" },
};

export default function WarehouseMovementsPage() {
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: warehouses = [] } = useQuery<Wh[]>({
    queryKey: ["wh-warehouses"],
    queryFn: () => apiFetch("/warehouse/warehouses"),
  });

  const { data: movements = [], isLoading } = useQuery<Movement[]>({
    queryKey: ["wh-movements", warehouseId],
    queryFn: () => apiFetch(`/warehouse/movements${warehouseId !== "all" ? `?warehouseId=${warehouseId}` : ""}`),
  });

  const filtered = movements.filter(m =>
    m.product_name.toLowerCase().includes(search.toLowerCase()) ||
    (m.note ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity size={24} /> Mutasi Stok</h1>
          <p className="text-muted-foreground text-sm mt-1">Riwayat semua pergerakan stok</p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input placeholder="Cari produk / catatan..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
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
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sebelum</TableHead>
                  <TableHead className="text-right">Sesudah</TableHead>
                  <TableHead>Referensi</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Memuat...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                ) : filtered.map(m => {
                  const typeInfo = TYPE_LABELS[m.type] ?? { label: m.type, color: "bg-gray-400" };
                  const isIn = ["po_receipt","transfer_in","return_in","manual_in","opname_adjust"].includes(m.type) && m.qty_after >= m.qty_before;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(m.created_at).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{m.product_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{m.sku}</div>
                      </TableCell>
                      <TableCell className="text-sm">{m.warehouse_name}</TableCell>
                      <TableCell className={`text-right font-bold ${isIn ? "text-green-600" : "text-red-600"}`}>
                        {isIn ? "+" : "-"}{fmt(m.qty)} {m.unit}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{fmt(m.qty_before)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(m.qty_after)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.ref_type ? `${m.ref_type} #${m.ref_id}` : "-"}
                      </TableCell>
                      <TableCell className="text-xs max-w-32 truncate" title={m.note ?? ""}>{m.note ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
