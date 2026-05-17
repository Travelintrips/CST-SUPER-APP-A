import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GitBranch, ArrowLeftRight, RefreshCw, Warehouse, Info } from "lucide-react";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include", ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any)?.message ?? `Error ${res.status}`); }
  return res.json();
}

interface WhLink {
  id: number; pos_warehouse_id: number; erp_warehouse_id: number; is_active: boolean; note: string | null;
  pos_warehouse_name: string; branch_name: string | null; business_unit: string | null;
  erp_warehouse_name: string; warehouse_code: string;
}
interface PosWarehouse { id: number; name: string; type: string; branch_name: string | null; business_unit: string | null; }
interface ErpWarehouse { id: number; warehouse_code: string; warehouse_name: string; warehouse_type: string; }

function LinkDialog({
  open, onClose, posWhs, erpWhs, onSave,
}: {
  open: boolean; onClose: () => void;
  posWhs: PosWarehouse[]; erpWhs: ErpWarehouse[];
  onSave: (d: { posWarehouseId: number; erpWarehouseId: number; note?: string }) => Promise<void>;
}) {
  const [posId, setPosId] = useState("");
  const [erpId, setErpId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!posId || !erpId) return;
    setSaving(true);
    try {
      await onSave({ posWarehouseId: Number(posId), erpWarehouseId: Number(erpId), note: note || undefined });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" /> Tambah Link Gudang
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Gudang POS (wh_stock)</Label>
            <Select value={posId} onValueChange={setPosId}>
              <SelectTrigger><SelectValue placeholder="Pilih gudang POS..." /></SelectTrigger>
              <SelectContent>
                {posWhs.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name} {w.branch_name ? `(${w.branch_name})` : ""} {w.business_unit ? `[${w.business_unit}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Gudang di sistem POS/Kasir</p>
          </div>
          <div className="flex items-center justify-center">
            <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <Label>Gudang ERP (inventory_stock)</Label>
            <Select value={erpId} onValueChange={setErpId}>
              <SelectTrigger><SelectValue placeholder="Pilih gudang ERP..." /></SelectTrigger>
              <SelectContent>
                {erpWhs.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    [{w.warehouse_code}] {w.warehouse_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Gudang di sistem ERP/Inventory</p>
          </div>
          <div>
            <Label>Catatan (opsional)</Label>
            <Input placeholder="cth: Link utama cabang A" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving || !posId || !erpId}>
            {saving ? "Menyimpan…" : "Simpan Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ThaiTeaBranchesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(false);

  const { data: links = [], isLoading } = useQuery<WhLink[]>({
    queryKey: ["tt-wh-links"],
    queryFn: () => apiFetch("/warehouse-links"),
  });
  const { data: posWhs = [] } = useQuery<PosWarehouse[]>({
    queryKey: ["tt-pos-whs"],
    queryFn: () => apiFetch("/warehouses"),
  });
  const { data: erpWhs = [] } = useQuery<ErpWarehouse[]>({
    queryKey: ["tt-erp-whs"],
    queryFn: () => apiFetch("/erp-warehouses"),
  });

  const saveMut = useMutation({
    mutationFn: (d: { posWarehouseId: number; erpWarehouseId: number; note?: string }) =>
      apiFetch("/warehouse-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      }),
    onSuccess: () => {
      toast({ title: "Link gudang disimpan" });
      qc.invalidateQueries({ queryKey: ["tt-wh-links"] });
      setDialog(false);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/warehouse-links/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Link dihapus" }); qc.invalidateQueries({ queryKey: ["tt-wh-links"] }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tt-wh-links"] });
    qc.invalidateQueries({ queryKey: ["tt-pos-whs"] });
    qc.invalidateQueries({ queryKey: ["tt-erp-whs"] });
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-amber-400" /> Monitoring Cabang Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kelola link gudang POS ↔ ERP untuk sinkronisasi stok ganda (dual-stock)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setDialog(true)}>
              <Plus className="mr-2 h-4 w-4" /> Tambah Link
            </Button>
          </div>
        </div>

        {/* Info */}
        <Card className="bg-blue-950/20 border-blue-800/30">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-300">Cara Kerja Dual-Stock Sync</p>
              <p className="text-muted-foreground mt-0.5">
                Setiap gudang POS bisa dilink ke gudang ERP. Saat terjadi penerimaan bahan atau produksi,
                sistem otomatis memperbarui <code className="text-xs bg-muted px-1 rounded">wh_stock</code> (POS) DAN{" "}
                <code className="text-xs bg-muted px-1 rounded">inventory_stock</code> (ERP) secara bersamaan.
                Kasir dapat menjual produk Thai Tea dan stok bahan baku berkurang di kedua sistem.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Link Aktif</p>
              <p className="text-2xl font-bold text-emerald-400">{links.filter((l) => l.is_active).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Gudang POS Tersedia</p>
              <p className="text-2xl font-bold">{posWhs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Gudang ERP Tersedia</p>
              <p className="text-2xl font-bold">{erpWhs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Total Link</p>
              <p className="text-2xl font-bold">{links.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Links Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Mapping Gudang POS ↔ ERP
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gudang POS</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead><ArrowLeftRight className="h-3.5 w-3.5 inline" /></TableHead>
                  <TableHead>Gudang ERP</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat…</TableCell></TableRow>
                ) : links.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Belum ada link gudang. Klik "Tambah Link" untuk menghubungkan gudang POS ke ERP.
                  </TableCell></TableRow>
                ) : links.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4 text-amber-400" />
                        <span className="font-medium">{l.pos_warehouse_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm">{l.branch_name ?? "—"}</span>
                        {l.business_unit && <Badge variant="outline" className="ml-2 text-xs">{l.business_unit}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><ArrowLeftRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4 text-blue-400" />
                        <span className="font-medium">{l.erp_warehouse_name}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="font-mono text-xs">{l.warehouse_code}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={l.is_active ? "default" : "secondary"}>
                        {l.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.note ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => { if (confirm("Hapus link gudang ini?")) deleteMut.mutate(l.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* POS Warehouses reference */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-amber-400" /> Daftar Gudang POS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {posWhs.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                    <span className="text-sm font-medium">{w.name}</span>
                    <div className="flex gap-2">
                      {w.branch_name && <span className="text-xs text-muted-foreground">{w.branch_name}</span>}
                      <Badge variant="outline" className="text-xs">{w.type}</Badge>
                    </div>
                  </div>
                ))}
                {posWhs.length === 0 && <p className="text-sm text-muted-foreground py-2">Belum ada gudang POS</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-blue-400" /> Daftar Gudang ERP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {erpWhs.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                    <span className="text-sm font-medium">{w.warehouse_name}</span>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{w.warehouse_code}</Badge>
                      <Badge variant="secondary" className="text-xs">{w.warehouse_type}</Badge>
                    </div>
                  </div>
                ))}
                {erpWhs.length === 0 && <p className="text-sm text-muted-foreground py-2">Belum ada gudang ERP</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <LinkDialog
        open={dialog}
        onClose={() => setDialog(false)}
        posWhs={posWhs}
        erpWhs={erpWhs}
        onSave={(d) => saveMut.mutateAsync(d)}
      />
    </AppShell>
  );
}
