import { AppShell } from "@/components/layout/AppShell";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, Camera, CameraOff, Package, LayoutGrid, Warehouse, ArrowLeftRight, RefreshCw } from "lucide-react";

type ScanType = "product" | "rack" | "warehouse" | "transfer";
interface ScanResult {
  type: ScanType;
  id: number;
  raw: string;
}

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function parseQrData(raw: string): ScanResult | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj.t || !obj.id) return null;
    const typeMap: Record<string, ScanType> = { product: "product", rack: "rack", warehouse: "warehouse", transfer: "transfer" };
    const type = typeMap[obj.t];
    if (!type) return null;
    return { type, id: Number(obj.id), raw };
  } catch {
    return null;
  }
}

const fmt = (n: string | number) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });
const STATUS_LABEL: Record<string, string> = { draft: "Draft", pending: "Menunggu", in_transit: "Dikirim", received: "Diterima", cancelled: "Dibatalkan" };

export default function PosQrScannerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRaw, setLastRaw] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) return;
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          const text = result.getText();
          if (text === lastRaw) return;
          setLastRaw(text);
          const parsed = parseQrData(text);
          if (parsed) {
            setScanResult(parsed);
          } else {
            setError(`QR tidak dikenal: ${text}`);
          }
        }
      });
      controlsRef.current = controls;
      setScanning(true);
    } catch (e: unknown) {
      setError("Kamera tidak bisa diakses. Pastikan izin kamera diberikan.");
      setScanning(false);
    }
  }, [lastRaw]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  function handleClose() {
    setScanResult(null);
    setLastRaw(null);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Scan QR Code</h1>
              <p className="text-sm text-muted-foreground">Scan QR produk, rak, gudang, atau transfer</p>
            </div>
          </div>
          <Button onClick={scanning ? stopCamera : startCamera} variant={scanning ? "destructive" : "default"} className="gap-2">
            {scanning ? <><CameraOff className="h-4 w-4" /> Stop Kamera</> : <><Camera className="h-4 w-4" /> Mulai Scan</>}
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>
        )}

        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <div className="relative w-full max-w-sm aspect-square bg-black rounded-xl overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-primary w-48 h-48 rounded-lg animate-pulse opacity-60" />
                </div>
              )}
              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                  <Camera className="h-12 w-12 opacity-50" />
                  <p className="text-sm opacity-70">Klik "Mulai Scan" untuk membuka kamera</p>
                </div>
              )}
            </div>
            {lastRaw && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3" />
                <span className="font-mono truncate max-w-xs">{lastRaw}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Package, label: "Produk", desc: "Lihat stok per gudang", color: "bg-blue-50 text-blue-600" },
            { icon: LayoutGrid, label: "Rak", desc: "Lihat isi rak", color: "bg-green-50 text-green-600" },
            { icon: Warehouse, label: "Gudang", desc: "Lihat semua stok", color: "bg-purple-50 text-purple-600" },
            { icon: ArrowLeftRight, label: "Transfer", desc: "Lihat detail transfer", color: "bg-orange-50 text-orange-600" },
          ].map(({ icon: Icon, label, desc, color }) => (
            <Card key={label} className="border-dashed">
              <CardContent className="pt-4 pb-3 flex flex-col items-center gap-1 text-center">
                <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Scan Result Modal */}
      {scanResult && (
        <ScanResultModal scanResult={scanResult} onClose={handleClose} />
      )}
    </AppShell>
  );
}

function ScanResultModal({ scanResult, onClose }: { scanResult: ScanResult; onClose: () => void }) {
  const { type, id } = scanResult;

  const { data, isLoading, error } = useQuery({
    queryKey: ["scan-result", type, id],
    queryFn: () => apiFetch(`/pos-inventory/scan-result/${type}/${id}`),
  });

  const icons: Record<ScanType, typeof Package> = { product: Package, rack: LayoutGrid, warehouse: Warehouse, transfer: ArrowLeftRight };
  const Icon = icons[type];
  const titles: Record<ScanType, string> = { product: "Detail Produk", rack: "Isi Rak", warehouse: "Stok Gudang", transfer: "Detail Transfer" };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" /> {titles[type]}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Memuat data...</p>}
        {error && <p className="text-sm text-destructive py-4">Gagal memuat: {(error as Error).message}</p>}
        {data && type === "product" && <ProductResult data={data} />}
        {data && type === "rack" && <RackResult data={data} />}
        {data && type === "warehouse" && <WarehouseResult data={data} />}
        {data && type === "transfer" && <TransferResult data={data} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductResult({ data }: { data: { item: Record<string, unknown>; stocks: Record<string, unknown>[] } }) {
  const total = data.stocks.reduce((s, r) => s + Number(r.qty), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Nama:</span> <strong className="ml-1">{String(data.item.name)}</strong></div>
        <div><span className="text-muted-foreground">SKU:</span> <span className="font-mono ml-1">{String(data.item.sku)}</span></div>
        <div><span className="text-muted-foreground">Satuan:</span> <span className="ml-1">{String(data.item.unit)}</span></div>
        <div><span className="text-muted-foreground">Total Stok:</span> <strong className="ml-1">{fmt(total)} {String(data.item.unit)}</strong></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Cabang</TableHead><TableHead>Gudang</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.stocks.map((s, i) => (
            <TableRow key={i}>
              <TableCell className="text-sm">{String(s.branch_name)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{String(s.warehouse_name ?? "-")}</TableCell>
              <TableCell className="text-right font-medium">{fmt(s.qty as number)}</TableCell>
            </TableRow>
          ))}
          {data.stocks.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Tidak ada stok tercatat</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

function RackResult({ data }: { data: { rack: Record<string, unknown>; stocks: Record<string, unknown>[] } }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Kode:</span> <strong className="font-mono ml-1">{String(data.rack.code)}</strong></div>
        <div><span className="text-muted-foreground">Nama:</span> <span className="ml-1">{String(data.rack.name)}</span></div>
        <div><span className="text-muted-foreground">Gudang:</span> <span className="ml-1">{String(data.rack.warehouse_name)}</span></div>
        <div><span className="text-muted-foreground">Cabang:</span> <span className="ml-1">{String(data.rack.branch_name)}</span></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.stocks.map((s, i) => (
            <TableRow key={i}>
              <TableCell>{String(s.item_name)} <span className="text-xs text-muted-foreground">({String(s.unit)})</span></TableCell>
              <TableCell className="text-right font-medium">{fmt(s.qty as number)}</TableCell>
            </TableRow>
          ))}
          {data.stocks.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Rak kosong</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

function WarehouseResult({ data }: { data: { warehouse: Record<string, unknown>; stocks: Record<string, unknown>[] } }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Gudang:</span> <strong className="ml-1">{String(data.warehouse.name)}</strong></div>
        <div><span className="text-muted-foreground">Cabang:</span> <span className="ml-1">{String(data.warehouse.branch_name)}</span></div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.stocks.map((s, i) => (
              <TableRow key={i}>
                <TableCell>{String(s.item_name)} <span className="text-xs text-muted-foreground">({String(s.unit)})</span></TableCell>
                <TableCell className={`text-right font-medium ${Number(s.qty) <= Number(s.min_stock) ? "text-red-500" : ""}`}>{fmt(s.qty as number)}</TableCell>
              </TableRow>
            ))}
            {data.stocks.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Gudang kosong</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TransferResult({ data }: { data: { transfer: Record<string, unknown>; items: Record<string, unknown>[] } }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div><span className="text-muted-foreground">No:</span> <span className="font-mono ml-1">{String(data.transfer.transfer_number)}</span></div>
        <div><span className="text-muted-foreground">Status:</span> <Badge className="ml-2">{STATUS_LABEL[String(data.transfer.status)] ?? String(data.transfer.status)}</Badge></div>
        <div><span className="text-muted-foreground">Dari:</span> <span className="ml-1">{String(data.transfer.from_branch_name)}</span></div>
        <div><span className="text-muted-foreground">Ke:</span> <span className="ml-1">{String(data.transfer.to_branch_name)}</span></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.items.map((it, i) => (
            <TableRow key={i}>
              <TableCell>{String(it.item_name)}</TableCell>
              <TableCell className="text-right">{fmt(it.qty as number)} {String(it.unit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
