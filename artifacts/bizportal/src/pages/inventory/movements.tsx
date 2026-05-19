import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";

interface Wh { id: number; warehouse_name: string; branch_name: string | null; }
interface Movement {
  id: number; type: string; qty: number; qty_before: number; qty_after: number;
  cost_price: number; ref_type: string | null; ref_id: number | null; note: string | null;
  created_at: string; product_name: string; sku: string; unit: string;
  warehouse_name: string; branch_name: string | null; rack_code: string | null;
}

const apiFetch = async (path: string) => {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const fmtDate = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

const TYPE_CONFIG: Record<string, { label: string; cls: string; dir: "in" | "out" | "adj" }> = {
  po_receipt:     { label: "Terima PO",        cls: "bg-green-100 text-green-700",  dir: "in" },
  so_delivery:    { label: "Keluar SO",         cls: "bg-blue-100 text-blue-700",   dir: "out" },
  pos_sale:       { label: "Penjualan POS",     cls: "bg-purple-100 text-purple-700", dir: "out" },
  transfer_in:    { label: "Transfer Masuk",    cls: "bg-cyan-100 text-cyan-700",   dir: "in" },
  transfer_out:   { label: "Transfer Keluar",   cls: "bg-orange-100 text-orange-700", dir: "out" },
  opname_adjust:  { label: "Opname",            cls: "bg-yellow-100 text-yellow-700", dir: "adj" },
  damage:         { label: "Rusak/Hilang",      cls: "bg-red-100 text-red-700",     dir: "out" },
  return_in:      { label: "Retur Masuk",       cls: "bg-teal-100 text-teal-700",   dir: "in" },
  return_out:     { label: "Retur Keluar",      cls: "bg-rose-100 text-rose-700",   dir: "out" },
  manual_in:      { label: "Masuk Manual",      cls: "bg-slate-100 text-slate-700", dir: "in" },
  manual_out:     { label: "Keluar Manual",     cls: "bg-slate-100 text-slate-700", dir: "out" },
};

export default function InventoryMovementsPage() {
  const [warehouseId, setWarehouseId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });

  const buildParams = () => {
    const p = new URLSearchParams();
    if (warehouseId !== "all") p.set("warehouseId", warehouseId);
    if (typeFilter !== "all") p.set("type", typeFilter);
    return p.toString() ? `?${p}` : "";
  };

  const { data: movements = [], isLoading } = useQuery<Movement[]>({
    queryKey: ["inv-movements", warehouseId, typeFilter],
    queryFn: () => apiFetch(`/inventory/movements${buildParams()}`),
  });

  const filtered = movements.filter(m =>
    m.product_name.toLowerCase().includes(search.toLowerCase()) ||
    m.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity size={22} /> Riwayat Pergerakan Stok</h1>
          <p className="text-sm text-muted-foreground mt-1">Semua perubahan stok tercatat sebagai audit trail</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input placeholder="Cari produk/SKU..." value={search} onChange={e => setSearch(e.target.value)} className="w-52" />
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Semua Gudang" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Gudang</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Semua Tipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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
                  <TableHead>Gudang / Cabang</TableHead>
                  <TableHead className="text-right">Sebelum</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sesudah</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                : filtered.map(m => {
                  const cfg = TYPE_CONFIG[m.type];
                  const qtyStr = m.qty > 0 ? `+${fmt(m.qty)}` : fmt(m.qty);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg?.cls ?? "bg-gray-100 text-gray-600"}`}>
                          {cfg?.label ?? m.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{m.product_name}</div>
                        <div className="text-xs font-mono text-muted-foreground">{m.sku}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.warehouse_name}
                        {m.branch_name && <span className="text-muted-foreground text-xs block">{m.branch_name}</span>}
                        {m.rack_code && <span className="text-muted-foreground text-xs">Rak: {m.rack_code}</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmt(m.qty_before)} {m.unit}</TableCell>
                      <TableCell className={`text-right font-bold text-sm ${cfg?.dir === "in" ? "text-green-600" : cfg?.dir === "out" ? "text-red-600" : "text-yellow-600"}`}>
                        {cfg?.dir === "in" ? "+" : cfg?.dir === "out" ? "-" : "±"}{fmt(m.qty)} {m.unit}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmt(m.qty_after)} {m.unit}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{m.note ?? (m.ref_type ? `${m.ref_type} #${m.ref_id}` : "—")}</TableCell>
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
