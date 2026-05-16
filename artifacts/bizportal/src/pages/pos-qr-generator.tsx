import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode, Download, Printer, Search } from "lucide-react";
import QRCode from "qrcode";

type EntityType = "product" | "rack" | "warehouse" | "transfer";

interface InvItem { id: number; name: string; sku: string; unit: string; }
interface Rack { id: number; code: string; name: string; warehouse_name: string; branch_name?: string; }
interface Warehouse { id: number; name: string; branch_id: number; }
interface Branch { id: number; name: string; }
interface Transfer { id: number; transfer_number: string; from_branch_name: string; to_branch_name: string; status: string; }

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function makeQrData(type: EntityType, row: Record<string, unknown>): string {
  switch (type) {
    case "product": return JSON.stringify({ t: "product", id: row.id, name: row.name, sku: row.sku });
    case "rack": return JSON.stringify({ t: "rack", id: row.id, code: row.code, name: row.name });
    case "warehouse": return JSON.stringify({ t: "warehouse", id: row.id, name: row.name });
    case "transfer": return JSON.stringify({ t: "transfer", id: row.id, num: row.transfer_number });
    default: return "";
  }
}

function QrCanvas({ data, size = 160 }: { data: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current && data) {
      QRCode.toCanvas(canvasRef.current, data, { width: size, margin: 1, errorCorrectionLevel: "M" }).catch(() => {});
    }
  }, [data, size]);
  return <canvas ref={canvasRef} className="rounded" />;
}

async function downloadQR(data: string, filename: string) {
  const url = await QRCode.toDataURL(data, { width: 400, margin: 2, errorCorrectionLevel: "M" });
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.png`;
  a.click();
}

export default function PosQrGeneratorPage() {
  const [type, setType] = useState<EntityType>("product");
  const [search, setSearch] = useState("");
  const [previewData, setPreviewData] = useState<{ data: string; label: string } | null>(null);
  const [branches] = [useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") })];

  const { data: products = [] } = useQuery<InvItem[]>({ queryKey: ["pos-inventory-items"], queryFn: () => apiFetch("/pos-inventory/inventory-items"), enabled: type === "product" });
  const { data: racks = [] } = useQuery<Rack[]>({ queryKey: ["pos-racks-all"], queryFn: () => apiFetch("/pos-inventory/racks"), enabled: type === "rack" });
  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ["pos-warehouses"], queryFn: () => apiFetch("/pos-inventory/warehouses"), enabled: type === "warehouse" });
  const { data: branchList = [] } = useQuery<Branch[]>({ queryKey: ["pos-branches"], queryFn: () => apiFetch("/pos-inventory/branches") });
  const { data: transfers = [] } = useQuery<Transfer[]>({ queryKey: ["pos-stock-transfers"], queryFn: () => apiFetch("/pos-inventory/stock-transfers"), enabled: type === "transfer" });

  const warehousesWithBranch = warehouses.map(w => ({
    ...w,
    branch_name: branchList.find(b => b.id === w.branch_id)?.name ?? "-",
  }));

  const rows: Record<string, unknown>[] = (() => {
    const q = search.toLowerCase();
    switch (type) {
      case "product": return products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
      case "rack": return (racks as Record<string, unknown>[]).filter(r => String(r.code ?? "").toLowerCase().includes(q) || String(r.name ?? "").toLowerCase().includes(q));
      case "warehouse": return (warehousesWithBranch as Record<string, unknown>[]).filter(w => String(w.name ?? "").toLowerCase().includes(q));
      case "transfer": return (transfers as Record<string, unknown>[]).filter(t => String(t.transfer_number ?? "").toLowerCase().includes(q));
      default: return [];
    }
  })();

  function getLabel(row: Record<string, unknown>): string {
    switch (type) {
      case "product": return `${row.name} (${row.sku})`;
      case "rack": return `${row.code} – ${row.name}`;
      case "warehouse": return `${row.name} · ${row.branch_name}`;
      case "transfer": return `${row.transfer_number}`;
      default: return "";
    }
  }

  const TYPE_OPTIONS: { value: EntityType; label: string }[] = [
    { value: "product", label: "Produk / Bahan Baku" },
    { value: "rack", label: "Rak" },
    { value: "warehouse", label: "Gudang" },
    { value: "transfer", label: "Transfer" },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <QrCode className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Generator QR Code</h1>
            <p className="text-sm text-muted-foreground">Generate QR untuk produk, rak, gudang, dan transfer</p>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Select value={type} onValueChange={v => { setType(v as EntityType); setSearch(""); }}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {rows.map((row, i) => {
            const qrData = makeQrData(type, row);
            const label = getLabel(row);
            return (
              <Card key={i} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setPreviewData({ data: qrData, label })}>
                <CardContent className="pt-4 pb-3 flex flex-col items-center gap-2">
                  <QrCanvas data={qrData} size={120} />
                  <p className="text-xs text-center font-medium leading-tight text-muted-foreground line-clamp-2">{label}</p>
                  <div className="flex gap-1 w-full">
                    <Button
                      size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
                      onClick={e => { e.stopPropagation(); downloadQR(qrData, label.replace(/[^a-zA-Z0-9]/g, "_")); }}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1"
                      onClick={e => { e.stopPropagation(); setPreviewData({ data: qrData, label }); }}
                    >
                      <Printer className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {rows.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              {search ? "Tidak ada hasil pencarian" : "Pilih tipe dan data akan muncul di sini"}
            </div>
          )}
        </div>
      </div>

      {/* Preview / Print Dialog */}
      <Dialog open={!!previewData} onOpenChange={v => { if (!v) setPreviewData(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Code — {previewData?.label}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {previewData && <QrCanvas data={previewData.data} size={240} />}
            <p className="text-sm text-center font-medium">{previewData?.label}</p>
            <p className="text-xs text-muted-foreground font-mono break-all text-center">{previewData?.data}</p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => { if (previewData) downloadQR(previewData.data, previewData.label.replace(/[^a-zA-Z0-9]/g, "_")); }}>
                <Download className="h-4 w-4" /> Unduh PNG
              </Button>
              <Button className="flex-1 gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
