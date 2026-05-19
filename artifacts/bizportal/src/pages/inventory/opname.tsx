import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Plus, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Wh { id: number; warehouse_name: string; branch_name: string | null; }
interface OpnameLine {
  id: number; product_id: number; product_name: string; sku: string; unit: string;
  system_qty: number; actual_qty: number; diff_qty: number; note: string | null;
}
interface Opname {
  id: number; opname_number: string; status: string;
  warehouse_name: string; branch_name: string | null;
  note: string | null; created_at: string; confirmed_at: string | null;
  lines: OpnameLine[] | null;
}

const apiFetch = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

const STATUS_CLS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-green-100 text-green-700",
};

export default function InventoryOpnamePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingLines, setEditingLines] = useState<Record<number, string>>({});
  const [form, setForm] = useState({ warehouseId: "", note: "" });

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["inv-warehouses"], queryFn: () => apiFetch("/inventory/warehouses") });
  const { data: opnames = [], isLoading } = useQuery<Opname[]>({ queryKey: ["inv-opname"], queryFn: () => apiFetch("/inventory/opname") });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/inventory/opname", {
      method: "POST",
      body: JSON.stringify({ warehouseId: Number(form.warehouseId), note: form.note || null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-opname"] }); toast({ title: "Opname dibuat — isi stok fisik lalu konfirmasi" }); setOpen(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ opnameId, lineId, actualQty }: { opnameId: number; lineId: number; actualQty: number }) =>
      apiFetch(`/inventory/opname/${opnameId}/lines/${lineId}`, { method: "PUT", body: JSON.stringify({ actualQty }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inv-opname"] }); },
    onError: (e: Error) => toast({ title: "Gagal simpan", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/inventory/opname/${id}/confirm`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inv-opname"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-summary"] });
      qc.invalidateQueries({ queryKey: ["inv-stock-detail"] });
      toast({ title: "Opname dikonfirmasi — stok disesuaikan otomatis" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const handleLineChange = (lineId: number, val: string) => {
    setEditingLines(prev => ({ ...prev, [lineId]: val }));
  };

  const saveLineQty = (opnameId: number, lineId: number) => {
    const val = editingLines[lineId];
    if (val === undefined || val === "") return;
    updateLineMutation.mutate({ opnameId, lineId, actualQty: Number(val) });
  };

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck size={22} className="text-blue-500" /> Stock Opname</h1>
            <p className="text-sm text-muted-foreground mt-1">Hitung fisik stok, bandingkan dengan sistem, dan buat adjustment otomatis</p>
          </div>
          <Button onClick={() => { setForm({ warehouseId: "", note: "" }); setOpen(true); }}>
            <Plus size={16} className="mr-1" /> Buat Opname
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>No. Opname</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Dikonfirmasi</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                : opnames.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Belum ada opname</TableCell></TableRow>
                : opnames.map(o => (
                  <>
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                      <TableCell>{expanded === o.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</TableCell>
                      <TableCell className="font-mono text-xs">{o.opname_number}</TableCell>
                      <TableCell className="text-sm font-medium">{o.warehouse_name}</TableCell>
                      <TableCell className="text-sm">{o.branch_name ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[o.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {o.status === "draft" ? "Draft (Dalam Proses)" : "Dikonfirmasi"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(o.created_at)}</TableCell>
                      <TableCell className="text-sm">{o.confirmed_at ? fmtDate(o.confirmed_at) : "—"}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        {o.status === "draft" && (
                          <Button size="sm" onClick={() => confirmMutation.mutate(o.id)} disabled={confirmMutation.isPending}>
                            <CheckCircle size={13} className="mr-1" /> Konfirmasi & Adjust
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded === o.id && (
                      <TableRow key={`${o.id}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/20 p-0">
                          <div className="p-3">
                            {o.status === "draft" && (
                              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2 mb-3">
                                Isi kolom <strong>Stok Fisik</strong> untuk setiap item, lalu tekan Enter atau klik di luar kolom untuk menyimpan. Setelah semua terisi, tekan <strong>Konfirmasi & Adjust</strong>.
                              </p>
                            )}
                            <Table>
                              <TableHeader>
                                <TableRow className="text-xs">
                                  <TableHead>Produk</TableHead>
                                  <TableHead>SKU</TableHead>
                                  <TableHead className="text-right">Stok Sistem</TableHead>
                                  <TableHead className="text-right">Stok Fisik</TableHead>
                                  <TableHead className="text-right">Selisih</TableHead>
                                  <TableHead>Satuan</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(o.lines ?? []).length === 0 ? (
                                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">Tidak ada item stok di gudang ini</TableCell></TableRow>
                                ) : (o.lines ?? []).map(line => {
                                  const editVal = editingLines[line.id];
                                  const displayActual = editVal !== undefined ? editVal : fmt(line.actual_qty);
                                  const diff = Number(line.diff_qty);
                                  return (
                                    <TableRow key={line.id} className="text-sm">
                                      <TableCell className="font-medium">{line.product_name}</TableCell>
                                      <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                                      <TableCell className="text-right">{fmt(line.system_qty)}</TableCell>
                                      <TableCell className="text-right">
                                        {o.status === "draft" ? (
                                          <Input
                                            type="number"
                                            className="w-24 h-7 text-right ml-auto"
                                            value={editVal ?? line.actual_qty}
                                            onChange={e => handleLineChange(line.id, e.target.value)}
                                            onBlur={() => saveLineQty(o.id, line.id)}
                                            onKeyDown={e => { if (e.key === "Enter") saveLineQty(o.id, line.id); }}
                                          />
                                        ) : (
                                          fmt(line.actual_qty)
                                        )}
                                      </TableCell>
                                      <TableCell className={`text-right font-bold ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                        {diff > 0 ? "+" : ""}{fmt(diff)}
                                      </TableCell>
                                      <TableCell>{line.unit}</TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                            {o.note && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">Catatan: {o.note}</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Buat Stock Opname</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Sistem akan mengambil semua item stok dari gudang yang dipilih sebagai acuan.</p>
              <div>
                <Label>Gudang *</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name ? `${w.branch_name} — ` : ""}{w.warehouse_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Catatan</Label>
                <Textarea rows={2} placeholder="Keterangan opname..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button disabled={createMutation.isPending || !form.warehouseId} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Membuat..." : "Mulai Opname"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
