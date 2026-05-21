import { AppShell } from "@/components/layout/AppShell";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardCheck, Eye, CheckCircle, ScanLine, Camera, CameraOff, Search } from "lucide-react";

interface Branch { id: number; name: string; }
interface Wh { id: number; name: string; branch_id: number; }
interface Opname { id: number; opname_number: string; branch_name: string; warehouse_name: string | null; status: string; note: string | null; created_at: string; confirmed_at: string | null; }
interface OpnameItem { item_id: number; item_name: string; unit: string; system_qty: string; actual_qty: string; diff_qty: string; note: string | null; sku?: string; }
interface OpnameDetail extends Opname { items: OpnameItem[]; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

function parseQrProduct(raw: string): number | null {
  try {
    const obj = JSON.parse(raw);
    if (obj.t === "product" && obj.id) return Number(obj.id);
  } catch { /**/ }
  return null;
}

export default function PosStockOpnamePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState({ branchId: "", warehouseId: "", note: "" });
  const [editItems, setEditItems] = useState<{ itemId: number; actualQty: string; note: string }[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: warehouses = [] } = useQuery<Wh[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses") });
  const { data: opnames = [], isLoading } = useQuery<Opname[]>({ queryKey: ["pos-stock-opnames"], queryFn: () => apiFetch("/pos-inventory/stock-opnames") });
  const { data: detail } = useQuery<OpnameDetail | null>({
    queryKey: ["pos-stock-opname-detail", viewId],
    queryFn: async () => {
      if (!viewId) return null;
      const d: OpnameDetail = await apiFetch(`/pos-inventory/stock-opnames/${viewId}`);
      if (d) setEditItems(d.items.map(i => ({ itemId: i.item_id, actualQty: String(i.actual_qty), note: i.note ?? "" })));
      return d;
    },
    enabled: !!viewId,
  });

  const filteredWarehouses = form.branchId ? warehouses.filter(w => w.branch_id === Number(form.branchId)) : [];

  const filteredItems = detail?.items.filter(i => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return i.item_name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q);
  }) ?? [];

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/pos-inventory/stock-opnames", {
      method: "POST",
      body: JSON.stringify({ branchId: Number(form.branchId), warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined, note: form.note || undefined }),
    }),
    onSuccess: (data: Opname) => {
      qc.invalidateQueries({ queryKey: ["pos-stock-opnames"] });
      toast({ title: "Opname dibuat, klik untuk mengisi data aktual" });
      setOpenNew(false);
      setViewId(data.id);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const saveItemsMutation = useMutation({
    mutationFn: () => apiFetch(`/pos-inventory/stock-opnames/${viewId}/items`, {
      method: "PUT",
      body: JSON.stringify({ items: editItems.map(i => ({ itemId: i.itemId, actualQty: Number(i.actualQty), note: i.note || undefined })) }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-stock-opname-detail", viewId] }); toast({ title: "Data aktual disimpan" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiFetch(`/pos-inventory/stock-opnames/${viewId}/confirm`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-stock-opnames"] });
      qc.invalidateQueries({ queryKey: ["pos-stock-opname-detail", viewId] });
      qc.invalidateQueries({ queryKey: ["pos-inventory-stocks"] });
      toast({ title: "Opname dikonfirmasi, stok telah disesuaikan" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function updateActualQty(itemId: number, val: string) {
    setEditItems(prev => prev.map(i => i.itemId === itemId ? { ...i, actualQty: val } : i));
  }

  const startScan = useCallback(async () => {
    setScanError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) return;
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          const productId = parseQrProduct(result.getText());
          if (productId) {
            setHighlightId(productId);
            setTimeout(() => {
              inputRefs.current[productId]?.focus();
              inputRefs.current[productId]?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
            toast({ title: `Produk ditemukan (ID ${productId}) — silakan input qty aktual` });
            controls.stop();
            controlsRef.current = null;
            setScanning(false);
            setScanOpen(false);
          } else {
            setScanError("QR bukan QR produk inventory. Coba scan ulang.");
          }
        }
      });
      controlsRef.current = controls;
      setScanning(true);
    } catch {
      setScanError("Kamera tidak bisa diakses.");
      setScanning(false);
    }
  }, [toast]);

  const stopScan = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Stock Opname</h1>
              <p className="text-sm text-muted-foreground">Hitung stok fisik dan sesuaikan dengan sistem</p>
            </div>
          </div>
          <Button onClick={() => { setForm({ branchId: "", warehouseId: "", note: "" }); setOpenNew(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Buat Opname
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? <p className="text-muted-foreground text-sm">Memuat...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Opname</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Gudang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opnames.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.opname_number}</TableCell>
                      <TableCell>{o.branch_name}</TableCell>
                      <TableCell className="text-muted-foreground">{o.warehouse_name ?? "Semua Gudang"}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === "confirmed" ? "default" : "secondary"}>
                          {o.status === "confirmed" ? "Dikonfirmasi" : "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fmtDate(o.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => { setHighlightId(null); setSearchQuery(""); setViewId(o.id); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {opnames.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data opname</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buat Opname */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Buat Stock Opname</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cabang *</Label>
              <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v, warehouseId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
                <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gudang (opsional)</Label>
              <Select value={form.warehouseId || "__all__"} onValueChange={v => setForm(f => ({ ...f, warehouseId: v === "__all__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Semua gudang" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Gudang</SelectItem>
                  {filteredWarehouses.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
            </div>
            <p className="text-xs text-muted-foreground">Sistem akan otomatis mengambil semua item stok dari cabang/gudang terpilih.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Batal</Button>
            <Button onClick={() => { if (!form.branchId) { toast({ title: "Pilih cabang", variant: "destructive" }); return; } createMutation.mutate(); }} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Membuat..." : "Buat Opname"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Opname */}
      <Dialog open={!!viewId} onOpenChange={v => { if (!v) { setViewId(null); stopScan(); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detail Opname — {detail?.opname_number}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <div><span className="text-muted-foreground">Cabang:</span> <span className="font-medium ml-1">{detail.branch_name}</span></div>
                <div><span className="text-muted-foreground">Gudang:</span> <span className="font-medium ml-1">{detail.warehouse_name ?? "Semua"}</span></div>
                <Badge variant={detail.status === "confirmed" ? "default" : "secondary"} className="ml-auto">
                  {detail.status === "confirmed" ? "Dikonfirmasi" : "Draft"}
                </Badge>
              </div>

              {detail.status === "draft" && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9 h-8 text-sm" placeholder="Cari item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => setScanOpen(true)}>
                    <ScanLine className="h-4 w-4" /> Scan QR
                  </Button>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Stok Sistem</TableHead>
                      <TableHead className="text-right">Stok Aktual</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.status === "draft" ? filteredItems : detail.items).map((item) => {
                      const ei = editItems.find(e => e.itemId === item.item_id);
                      const actualVal = detail.status === "draft" ? (ei?.actualQty ?? String(item.actual_qty)) : String(item.actual_qty);
                      const diff = Number(actualVal) - Number(item.system_qty);
                      const isHighlighted = highlightId === item.item_id;
                      return (
                        <TableRow key={item.item_id} className={isHighlighted ? "bg-primary/10 ring-1 ring-primary" : ""}>
                          <TableCell>
                            {item.item_name}
                            <span className="text-xs text-muted-foreground ml-1">({item.unit})</span>
                            {isHighlighted && <Badge className="ml-2 text-xs" variant="default">Scan</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{fmt(item.system_qty)}</TableCell>
                          <TableCell className="text-right">
                            {detail.status === "draft" ? (
                              <Input
                                type="number"
                                className="w-24 h-7 text-xs text-right ml-auto"
                                value={ei?.actualQty ?? ""}
                                onChange={e => updateActualQty(item.item_id, e.target.value)}
                                ref={el => { inputRefs.current[item.item_id] = el; }}
                              />
                            ) : fmt(item.actual_qty)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${diff < 0 ? "text-red-400" : diff > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                            {diff >= 0 ? "+" : ""}{fmt(diff)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {detail.items.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Tidak ada item stok untuk cabang/gudang ini</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {detail.status === "draft" && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => saveItemsMutation.mutate()} disabled={saveItemsMutation.isPending}>
                    {saveItemsMutation.isPending ? "Menyimpan..." : "Simpan Data Aktual"}
                  </Button>
                  <Button className="flex-1 gap-2" onClick={() => { if (confirm("Konfirmasi opname? Stok akan disesuaikan sesuai data aktual.")) confirmMutation.mutate(); }} disabled={confirmMutation.isPending}>
                    <CheckCircle className="h-4 w-4" /> {confirmMutation.isPending ? "Mengkonfirmasi..." : "Konfirmasi & Sesuaikan Stok"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Scan Dialog */}
      <Dialog open={scanOpen} onOpenChange={v => { if (!v) { stopScan(); setScanOpen(false); setScanError(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Scan QR Produk</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-primary w-40 h-40 rounded-lg animate-pulse opacity-70" />
                </div>
              )}
              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                  <Camera className="h-10 w-10 opacity-50" />
                  <p className="text-xs opacity-70">Tekan "Mulai Scan"</p>
                </div>
              )}
            </div>
            {scanError && <p className="text-xs text-destructive text-center">{scanError}</p>}
            <p className="text-xs text-muted-foreground text-center">Scan QR produk dari halaman Generator QR. Kamera akan otomatis berhenti setelah scan berhasil.</p>
            <Button className="w-full gap-2" onClick={scanning ? stopScan : startScan} variant={scanning ? "destructive" : "default"}>
              {scanning ? <><CameraOff className="h-4 w-4" /> Stop</> : <><Camera className="h-4 w-4" /> Mulai Scan</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
