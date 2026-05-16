import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeftRight, Truck, CheckCircle, Eye, X, Clock, Ban } from "lucide-react";

interface Branch { id: number; name: string; }
interface Wh { id: number; name: string; branch_id: number; }
interface InvItem { id: number; name: string; unit: string; sku: string; }
interface Transfer {
  id: number; transfer_number: string; from_branch_name: string; to_branch_name: string;
  status: string; note: string | null; created_at: string;
}
interface TransferDetail extends Transfer {
  items: { item_id: number; item_name: string; unit: string; qty: string; from_warehouse_name: string | null; to_warehouse_name: string | null; }[];
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Menunggu",
  in_transit: "Dikirim",
  received: "Diterima",
  cancelled: "Dibatalkan",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  pending: "outline",
  in_transit: "default",
  received: "outline",
  cancelled: "destructive",
};

export default function PosStockTransfersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [form, setForm] = useState({ fromBranchId: "", toBranchId: "", note: "" });
  const [lineItems, setLineItems] = useState<{ itemId: string; qty: string; fromWarehouseId: string; toWarehouseId: string }[]>([]);

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses") });
  const { data: invItems = [] } = useQuery<InvItem[]>({ queryKey: ["pos-inventory-items"], queryFn: () => apiFetch("/pos-inventory/inventory-items") });
  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({ queryKey: ["pos-stock-transfers"], queryFn: () => apiFetch("/pos-inventory/stock-transfers") });
  const { data: detail } = useQuery<TransferDetail | null>({
    queryKey: ["pos-stock-transfer-detail", viewId],
    queryFn: () => viewId ? apiFetch(`/pos-inventory/stock-transfers/${viewId}`) : null,
    enabled: !!viewId,
  });

  const fromWarehouses = form.fromBranchId ? warehouses.filter(w => w.branch_id === Number(form.fromBranchId)) : [];
  const toWarehouses = form.toBranchId ? warehouses.filter(w => w.branch_id === Number(form.toBranchId)) : [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pos-stock-transfers"] });
    qc.invalidateQueries({ queryKey: ["pos-stock-transfer-detail", viewId] });
  };

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/stock-transfers", {
      method: "POST",
      body: JSON.stringify({
        fromBranchId: Number(form.fromBranchId),
        toBranchId: Number(form.toBranchId),
        note: form.note || undefined,
        items: lineItems.filter(l => l.itemId && l.qty).map(l => ({
          itemId: Number(l.itemId), qty: Number(l.qty),
          fromWarehouseId: l.fromWarehouseId ? Number(l.fromWarehouseId) : undefined,
          toWarehouseId: l.toWarehouseId ? Number(l.toWarehouseId) : undefined,
        })),
      }),
    }),
    onSuccess: () => { invalidate(); toast({ title: "Transfer dibuat" }); setOpenNew(false); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const pendingMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/stock-transfers/${id}/pending`, { method: "PATCH" }),
    onSuccess: () => { invalidate(); toast({ title: "Transfer dipending" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/stock-transfers/${id}/send`, { method: "PATCH" }),
    onSuccess: () => { invalidate(); toast({ title: "Transfer dikirim – stok asal berkurang" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pos-inventory/stock-transfers/${id}/receive`, { method: "PATCH" }),
    onSuccess: () => { invalidate(); toast({ title: "Transfer diterima – stok tujuan bertambah" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      apiFetch(`/pos-inventory/stock-transfers/${id}/cancel`, { method: "PATCH", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Transfer dibatalkan" });
      setCancelOpen(false);
      setCancelReason("");
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function addLine() { setLineItems(l => [...l, { itemId: "", qty: "", fromWarehouseId: "", toWarehouseId: "" }]); }
  function removeLine(idx: number) { setLineItems(l => l.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: string, val: string) {
    setLineItems(l => l.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  function handleCreate() {
    if (!form.fromBranchId || !form.toBranchId) { toast({ title: "Pilih cabang asal dan tujuan", variant: "destructive" }); return; }
    if (form.fromBranchId === form.toBranchId) { toast({ title: "Cabang asal dan tujuan tidak boleh sama", variant: "destructive" }); return; }
    if (lineItems.filter(l => l.itemId && l.qty).length === 0) { toast({ title: "Tambah minimal 1 item", variant: "destructive" }); return; }
    createMutation.mutate();
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Transfer Stok</h1>
              <p className="text-sm text-muted-foreground">Kirim stok antar cabang — Draft → Menunggu → Dikirim → Diterima</p>
            </div>
          </div>
          <Button onClick={() => { setForm({ fromBranchId: "", toBranchId: "", note: "" }); setLineItems([{ itemId: "", qty: "", fromWarehouseId: "", toWarehouseId: "" }]); setOpenNew(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Buat Transfer
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Transfer</TableHead>
                    <TableHead>Dari</TableHead>
                    <TableHead>Ke</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                      <TableCell>{t.from_branch_name}</TableCell>
                      <TableCell>{t.to_branch_name}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[t.status] ?? "secondary"}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmt(t.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => setViewId(t.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {transfers.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data transfer</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buat Transfer Dialog */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Buat Transfer Stok</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dari Cabang *</Label>
                <Select value={form.fromBranchId} onValueChange={v => setForm(f => ({ ...f, fromBranchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Cabang asal" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ke Cabang *</Label>
                <Select value={form.toBranchId} onValueChange={v => setForm(f => ({ ...f, toBranchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Cabang tujuan" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Item yang Ditransfer</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Tambah
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lineItems.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Select value={line.itemId} onValueChange={v => updateLine(i, "itemId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Item" /></SelectTrigger>
                        <SelectContent>{invItems.map(it => <SelectItem key={it.id} value={String(it.id)}>{it.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs" type="number" value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} placeholder="Qty" />
                    </div>
                    <div className="col-span-3">
                      <Select value={line.fromWarehouseId} onValueChange={v => updateLine(i, "fromWarehouseId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Gudang asal" /></SelectTrigger>
                        <SelectContent>{fromWarehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <div className="flex gap-1">
                        <Select value={line.toWarehouseId} onValueChange={v => updateLine(i, "toWarehouseId", v)}>
                          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Gudang tujuan" /></SelectTrigger>
                          <SelectContent>{toWarehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeLine(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? "Menyimpan..." : "Buat Transfer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!viewId} onOpenChange={v => { if (!v) setViewId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Transfer — {detail?.transfer_number}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Dari:</span> <span className="font-medium ml-1">{detail.from_branch_name}</span></div>
                <div><span className="text-muted-foreground">Ke:</span> <span className="font-medium ml-1">{detail.to_branch_name}</span></div>
                <div><span className="text-muted-foreground">Status:</span>
                  <Badge className="ml-2" variant={STATUS_VARIANT[detail.status] ?? "secondary"}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </Badge>
                </div>
                {detail.note && <div className="col-span-2"><span className="text-muted-foreground">Catatan:</span> <span className="ml-1">{detail.note}</span></div>}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Gudang Asal</TableHead>
                    <TableHead>Gudang Tujuan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{it.item_name}</TableCell>
                      <TableCell className="text-right">{Number(it.qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })} {it.unit}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{it.from_warehouse_name ?? "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{it.to_warehouse_name ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex gap-2 pt-2 flex-wrap">
                {detail.status === "draft" && (
                  <Button variant="outline" className="gap-2 flex-1" onClick={() => pendingMutation.mutate(detail.id)} disabled={pendingMutation.isPending}>
                    <Clock className="h-4 w-4" /> Ajukan Pending
                  </Button>
                )}
                {(detail.status === "draft" || detail.status === "pending") && (
                  <Button className="gap-2 flex-1" onClick={() => { if (confirm("Kirim sekarang? Stok asal akan berkurang.")) sendMutation.mutate(detail.id); }} disabled={sendMutation.isPending}>
                    <Truck className="h-4 w-4" /> Kirim (In Transit)
                  </Button>
                )}
                {detail.status === "in_transit" && (
                  <Button className="gap-2 flex-1" onClick={() => { if (confirm("Konfirmasi penerimaan? Stok tujuan akan bertambah.")) receiveMutation.mutate(detail.id); }} disabled={receiveMutation.isPending}>
                    <CheckCircle className="h-4 w-4" /> Konfirmasi Terima
                  </Button>
                )}
                {["draft", "pending", "in_transit"].includes(detail.status) && (
                  <Button variant="destructive" size="icon" onClick={() => setCancelOpen(true)} title="Batalkan transfer">
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={v => { if (!v) { setCancelOpen(false); setCancelReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Batalkan Transfer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {detail?.status === "in_transit" && (
              <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">Stok asal akan dikembalikan karena transfer sudah in transit.</p>
            )}
            <div className="space-y-1">
              <Label>Alasan (opsional)</Label>
              <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Alasan pembatalan..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelOpen(false); setCancelReason(""); }}>Kembali</Button>
            <Button variant="destructive" onClick={() => { if (viewId) cancelMutation.mutate({ id: viewId, reason: cancelReason || undefined }); }} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Memproses..." : "Batalkan Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
