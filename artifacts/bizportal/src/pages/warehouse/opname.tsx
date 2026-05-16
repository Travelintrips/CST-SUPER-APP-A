import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Plus, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Wh { id: number; name: string; branch_name: string; }
interface OpnameLine {
  id: number; product_id: number; product_name: string; sku: string; unit: string;
  system_qty: number; actual_qty: number; diff_qty: number; note: string | null;
}
interface Opname {
  id: number; opname_number: string; status: string; note: string | null;
  warehouse_name: string; created_at: string; confirmed_at: string | null;
  lines: OpnameLine[] | null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

export default function WarehouseOpnamePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingLines, setEditingLines] = useState<Record<number, number>>({});
  const [form, setForm] = useState({ warehouseId: "", note: "" });

  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["wh-warehouses"], queryFn: () => apiFetch("/warehouse/warehouses") });
  const { data: opnames = [], isLoading } = useQuery<Opname[]>({ queryKey: ["wh-opnames"], queryFn: () => apiFetch("/warehouse/opnames") });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/warehouse/opnames", {
      method: "POST", body: JSON.stringify({ warehouseId: Number(data.warehouseId), note: data.note || null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-opnames"] }); toast({ title: "Opname dibuat" }); setOpen(false); setForm({ warehouseId: "", note: "" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ opnameId, lineId, actualQty }: { opnameId: number; lineId: number; actualQty: number }) =>
      apiFetch(`/warehouse/opnames/${opnameId}/lines/${lineId}`, { method: "PUT", body: JSON.stringify({ actualQty }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh-opnames"] }),
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/warehouse/opnames/${id}/confirm`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wh-opnames"] }); qc.invalidateQueries({ queryKey: ["wh-stock-summary"] }); toast({ title: "Opname dikonfirmasi, stok diperbarui" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck size={24} /> Stock Opname</h1>
            <p className="text-muted-foreground text-sm mt-1">Hitung fisik stok dan sesuaikan dengan sistem</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus size={16} className="mr-1" /> Buat Opname</Button>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Memuat...</CardContent></Card>
          ) : opnames.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Belum ada opname</CardContent></Card>
          ) : opnames.map(o => (
            <Card key={o.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-mono text-sm font-semibold">{o.opname_number}</div>
                      <div className="text-sm text-muted-foreground">{o.warehouse_name} · {new Date(o.created_at).toLocaleDateString("id-ID")}</div>
                    </div>
                    <Badge variant={o.status === "confirmed" ? "outline" : "secondary"}>
                      {o.status === "confirmed" ? "Selesai" : "Draft"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{o.lines?.length ?? 0} item</span>
                  </div>
                  <div className="flex gap-2">
                    {o.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => confirmMutation.mutate(o.id)} disabled={confirmMutation.isPending}>
                        <CheckCircle size={12} className="mr-1" /> Konfirmasi
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                      {expanded === o.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Button>
                  </div>
                </div>

                {expanded === o.id && o.lines && (
                  <div className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produk</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Stok Sistem</TableHead>
                          <TableHead className="text-right">Stok Aktual</TableHead>
                          <TableHead className="text-right">Selisih</TableHead>
                          {o.status === "draft" && <TableHead>Update</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {o.lines.map(l => (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{l.product_name}</TableCell>
                            <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                            <TableCell className="text-right">{fmt(l.system_qty)} {l.unit}</TableCell>
                            <TableCell className="text-right">
                              {o.status === "draft" ? (
                                <Input
                                  type="number"
                                  className="w-24 h-7 text-right"
                                  defaultValue={l.actual_qty}
                                  onChange={e => setEditingLines(prev => ({ ...prev, [l.id]: Number(e.target.value) }))}
                                />
                              ) : <span>{fmt(l.actual_qty)} {l.unit}</span>}
                            </TableCell>
                            <TableCell className={`text-right font-bold ${l.diff_qty < 0 ? "text-red-500" : l.diff_qty > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                              {l.diff_qty > 0 ? "+" : ""}{fmt(l.diff_qty)} {l.unit}
                            </TableCell>
                            {o.status === "draft" && (
                              <TableCell>
                                <Button size="sm" variant="ghost" onClick={() => {
                                  const qty = editingLines[l.id] ?? l.actual_qty;
                                  updateLineMutation.mutate({ opnameId: o.id, lineId: l.id, actualQty: qty });
                                }}>
                                  Simpan
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Buat Stock Opname</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Gudang</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih gudang..." /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.branch_name} — {w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Catatan</Label>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional..." />
              </div>
              <p className="text-xs text-muted-foreground">Sistem akan otomatis mengisi stok sistem dari data gudang terpilih.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending || !form.warehouseId}>
                {createMutation.isPending ? "Membuat..." : "Buat Opname"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
