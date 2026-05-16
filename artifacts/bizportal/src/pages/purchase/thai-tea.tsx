import { useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, ShoppingBag, Boxes, Plus, Pencil, Trash2, RefreshCw,
  Warehouse, AlertTriangle, ChefHat, TrendingUp, Sparkles,
} from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 3 });

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/thai-tea${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.message ?? `Error ${res.status}`);
  }
  return res.json();
}

interface ThaiTeaProduct {
  id: number;
  name: string;
  sku: string;
  unit: string;
  price: string;
  description: string | null;
  is_active: boolean;
}

interface ThaiTeaPurchase {
  id: number;
  doc_number: string;
  kind: string;
  status: string;
  receive_status: string;
  bill_status: string;
  supplier_name: string;
  total_amount: number;
  grand_total: number;
  expected_date: string | null;
  confirmed_at: string | null;
  created_at: string;
}

interface ThaiTeaStock {
  product_id: number;
  product_name: string;
  sku: string;
  unit: string;
  total_qty: number;
  avg_cost: number | null;
  warehouse_count: number;
  warehouses: Array<{
    warehouse_id: number;
    warehouse_name: string;
    branch_name: string;
    qty: number;
    cost_price: number;
  }> | null;
}

const statusLabel: Record<string, string> = {
  draft: "Draft", sent: "Terkirim", confirmed: "Dikonfirmasi", done: "Selesai", cancelled: "Dibatalkan",
};
const receiveLabel: Record<string, string> = {
  none: "—", to_receive: "Perlu Terima", received: "Diterima",
};
const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
  if (s === "confirmed" || s === "done") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "sent") return "outline";
  return "secondary";
};

const UNITS = ["kg", "gram", "liter", "ml", "pcs", "kaleng", "karton", "roll", "pack", "botol", "sachet"];

interface ProductFormData {
  name: string;
  sku: string;
  unit: string;
  price: string;
  description: string;
}

function ProductFormDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: ThaiTeaProduct | null;
  onSave: (data: ProductFormData) => void;
}) {
  const [form, setForm] = useState<ProductFormData>({
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    unit: initial?.unit ?? "kg",
    price: initial ? String(Number(initial.price)) : "",
    description: initial?.description ?? "",
  });

  const set = (k: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Bahan" : "Tambah Bahan Thai Tea"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nama Bahan</Label>
            <Input placeholder="cth: Teh Hitam CTC" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input placeholder="cth: BTT-TEH-001" value={form.sku} onChange={set("sku")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Satuan</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Harga Beli (Rp)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.price}
                onChange={set("price")}
              />
            </div>
          </div>
          <div>
            <Label>Deskripsi</Label>
            <Input placeholder="Keterangan singkat..." value={form.description} onChange={set("description")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name || !form.sku}>
            {initial ? "Simpan" : "Tambah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ThaiTeaPurchasePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [productDialog, setProductDialog] = useState<{ open: boolean; editing?: ThaiTeaProduct | null }>({ open: false });
  const [expandedStock, setExpandedStock] = useState<Set<number>>(new Set());

  const { data: products = [], isLoading: prodLoading } = useQuery<ThaiTeaProduct[]>({
    queryKey: ["thai-tea-products"],
    queryFn: () => apiFetch("/products"),
  });

  const { data: purchases = [], isLoading: purchLoading } = useQuery<ThaiTeaPurchase[]>({
    queryKey: ["thai-tea-purchases"],
    queryFn: () => apiFetch("/purchases"),
  });

  const { data: stocks = [], isLoading: stockLoading } = useQuery<ThaiTeaStock[]>({
    queryKey: ["thai-tea-stock"],
    queryFn: () => apiFetch("/stock"),
  });

  const seedMut = useMutation({
    mutationFn: () => apiFetch("/seed", { method: "POST" }),
    onSuccess: (data: any) => {
      toast({ title: "Seed Berhasil", description: `${data.seeded} bahan ditambahkan, ${data.skipped} sudah ada.` });
      qc.invalidateQueries({ queryKey: ["thai-tea-products"] });
      qc.invalidateQueries({ queryKey: ["thai-tea-stock"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: (data: ProductFormData) => apiFetch("/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, price: Number(data.price) }),
    }),
    onSuccess: () => {
      toast({ title: "Bahan ditambahkan" });
      qc.invalidateQueries({ queryKey: ["thai-tea-products"] });
      qc.invalidateQueries({ queryKey: ["thai-tea-stock"] });
      setProductDialog({ open: false });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProductFormData }) =>
      apiFetch(`/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, price: Number(data.price) }),
      }),
    onSuccess: () => {
      toast({ title: "Bahan diperbarui" });
      qc.invalidateQueries({ queryKey: ["thai-tea-products"] });
      qc.invalidateQueries({ queryKey: ["thai-tea-stock"] });
      setProductDialog({ open: false });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Bahan dihapus" });
      qc.invalidateQueries({ queryKey: ["thai-tea-products"] });
      qc.invalidateQueries({ queryKey: ["thai-tea-stock"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );
  const filteredPurchases = purchases.filter((p) =>
    p.doc_number.toLowerCase().includes(search.toLowerCase()) ||
    p.supplier_name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredStocks = stocks.filter((s) =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) || s.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalStockValue = stocks.reduce((acc, s) => acc + s.total_qty * (s.avg_cost ?? 0), 0);
  const lowStockCount = stocks.filter((s) => s.total_qty <= 0).length;
  const totalPurchaseValue = purchases
    .filter((p) => p.status !== "cancelled")
    .reduce((acc, p) => acc + p.grand_total, 0);
  const activePOCount = purchases.filter((p) => p.kind === "order" && p.status === "confirmed").length;

  const toggleExpand = (id: number) => {
    setExpandedStock((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ChefHat className="h-6 w-6 text-amber-400" />
              Pembelian Bahan Thai Tea
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kelola pembelian bahan baku Thai Tea dan pantau stok gudang CST
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedMut.mutate()}
              disabled={seedMut.isPending}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {seedMut.isPending ? "Memuat..." : "Seed Bahan Default"}
            </Button>
            <Link href="/purchase/rfq/new">
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Buat PO Baru
              </Button>
            </Link>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="products">Daftar Bahan ({products.length})</TabsTrigger>
            <TabsTrigger value="purchases">Riwayat Pembelian ({purchases.length})</TabsTrigger>
            <TabsTrigger value="stock">Stok CST ({stocks.length})</TabsTrigger>
          </TabsList>

          {/* ── TAB: DASHBOARD ── */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Total Jenis Bahan</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{products.length}</p>
                  <p className="text-xs text-muted-foreground">produk terdaftar</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Stok Habis / Kosong</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${lowStockCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {lowStockCount}
                  </p>
                  <p className="text-xs text-muted-foreground">item stok kosong / habis</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">PO Aktif</CardTitle>
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{activePOCount}</p>
                  <p className="text-xs text-muted-foreground">purchase order dikonfirmasi</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Nilai Stok CST</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{idr(totalStockValue)}</p>
                  <p className="text-xs text-muted-foreground">estimasi nilai inventori</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Purchases */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" /> Pembelian Terbaru
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {purchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Belum ada pembelian bahan Thai Tea</p>
                  ) : (
                    <div className="space-y-2">
                      {purchases.slice(0, 5).map((p) => (
                        <Link key={p.id} href={`/purchase/${p.kind === "rfq" ? "rfq" : "orders"}/${p.id}`}>
                          <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer">
                            <div>
                              <p className="text-sm font-medium">{p.doc_number}</p>
                              <p className="text-xs text-muted-foreground">{p.supplier_name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{idr(p.grand_total)}</p>
                              <Badge variant={statusVariant(p.status)} className="text-xs">
                                {statusLabel[p.status] ?? p.status}
                              </Badge>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link href="#" onClick={() => setTab("purchases")}>
                    <Button variant="ghost" size="sm" className="w-full mt-2">Lihat Semua →</Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Low Stock Warning */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Boxes className="h-4 w-4" /> Status Stok Bahan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stocks.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Belum ada data stok</p>
                  ) : (
                    <div className="space-y-2">
                      {stocks.slice(0, 6).map((s) => (
                        <div key={s.product_id} className="flex items-center justify-between p-2 rounded bg-muted/20">
                          <div>
                            <p className="text-sm font-medium">{s.product_name}</p>
                            <p className="text-xs text-muted-foreground">{s.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${s.total_qty <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {fmt(s.total_qty)} {s.unit}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setTab("stock")}>
                    Lihat Semua Stok →
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Total Purchase Value */}
            <Card className="border-amber-700/30 bg-amber-950/10">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Nilai Pembelian Bahan Thai Tea</p>
                    <p className="text-3xl font-bold text-amber-400 mt-1">{idr(totalPurchaseValue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Dari {purchases.filter(p => p.status !== "cancelled").length} transaksi (tidak termasuk yang dibatalkan)</p>
                  </div>
                  <ChefHat className="h-12 w-12 text-amber-400/30" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: DAFTAR BAHAN ── */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <Input
                placeholder="Cari nama atau SKU bahan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => seedMut.mutate()}
                  disabled={seedMut.isPending}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Seed Default
                </Button>
                <Button size="sm" onClick={() => setProductDialog({ open: true })}>
                  <Plus className="mr-2 h-4 w-4" /> Tambah Bahan
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Bahan</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Harga Beli</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prodLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Memuat...</TableCell>
                      </TableRow>
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {products.length === 0
                            ? "Belum ada bahan. Klik 'Seed Default' untuk memuat bahan umum Thai Tea."
                            : "Tidak ada bahan yang cocok dengan pencarian."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                          <TableCell>{p.unit}</TableCell>
                          <TableCell className="text-right">{idr(Number(p.price))}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.description ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setProductDialog({ open: true, editing: p })}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`Hapus bahan "${p.name}"?`)) deleteMut.mutate(p.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: RIWAYAT PEMBELIAN ── */}
          <TabsContent value="purchases" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <Input
                placeholder="Cari nomor PO atau vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Link href="/purchase/rfq/new">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Buat PO Baru
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Menampilkan semua Purchase Order / RFQ yang mengandung setidaknya satu bahan Thai Tea
            </p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nomor Dokumen</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Terima</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Tanggal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Memuat...</TableCell>
                      </TableRow>
                    ) : filteredPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {purchases.length === 0
                            ? "Belum ada pembelian bahan Thai Tea. Buat PO baru dan pilih bahan dari daftar produk Thai Tea."
                            : "Tidak ada hasil yang cocok."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPurchases.map((p) => (
                        <TableRow key={p.id} className="hover:bg-muted/30">
                          <TableCell>
                            <Link href={`/purchase/${p.kind === "rfq" ? "rfq" : "orders"}/${p.id}`}>
                              <span className="font-mono text-sm text-primary hover:underline cursor-pointer">
                                {p.doc_number}
                              </span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="uppercase text-xs">{p.kind}</Badge>
                          </TableCell>
                          <TableCell>{p.supplier_name}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(p.status)}>
                              {statusLabel[p.status] ?? p.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium ${p.receive_status === "received" ? "text-emerald-400" : p.receive_status === "to_receive" ? "text-amber-400" : "text-muted-foreground"}`}>
                              {receiveLabel[p.receive_status] ?? p.receive_status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">{idr(p.grand_total)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString("id-ID")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB: STOK CST ── */}
          <TabsContent value="stock" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <Input
                placeholder="Cari nama atau SKU bahan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["thai-tea-stock"] })}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Stok ini diperbarui otomatis saat Purchase Order bahan Thai Tea diterima (status "Diterima")
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Total Jenis Bahan</p>
                  <p className="text-2xl font-bold">{stocks.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Stok Kosong</p>
                  <p className={`text-2xl font-bold ${lowStockCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {lowStockCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Nilai Inventori</p>
                  <p className="text-2xl font-bold">{idr(totalStockValue)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Bahan</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Total Stok</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Harga Rata-rata</TableHead>
                      <TableHead className="text-right">Nilai Stok</TableHead>
                      <TableHead>Gudang</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Memuat...</TableCell>
                      </TableRow>
                    ) : filteredStocks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {stocks.length === 0
                            ? "Belum ada data stok. Buat dan terima PO bahan Thai Tea untuk memperbarui stok."
                            : "Tidak ada bahan yang cocok."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStocks.map((s) => (
                        <>
                          <TableRow
                            key={s.product_id}
                            className={`cursor-pointer hover:bg-muted/30 ${s.total_qty <= 0 ? "bg-red-950/10" : ""}`}
                            onClick={() => toggleExpand(s.product_id)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {s.total_qty <= 0 && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                                {s.product_name}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                            <TableCell className={`text-right font-bold ${s.total_qty <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                              {fmt(s.total_qty)}
                            </TableCell>
                            <TableCell>{s.unit}</TableCell>
                            <TableCell className="text-right">{s.avg_cost ? idr(s.avg_cost) : "—"}</TableCell>
                            <TableCell className="text-right">{idr(s.total_qty * (s.avg_cost ?? 0))}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{s.warehouse_count} gudang</span>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedStock.has(s.product_id) && s.warehouses && s.warehouses.map((wh, i) => (
                            <TableRow key={`${s.product_id}-wh-${i}`} className="bg-muted/10">
                              <TableCell />
                              <TableCell colSpan={2} className="text-xs text-muted-foreground pl-8">
                                <span className="flex items-center gap-1">
                                  <Warehouse className="h-3 w-3" />
                                  {wh.warehouse_name} {wh.branch_name ? `(${wh.branch_name})` : ""}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium" colSpan={1}>
                                {fmt(wh.qty)}
                              </TableCell>
                              <TableCell>{s.unit}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {idr(wh.cost_price)} / {s.unit}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          ))}
                        </>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ProductFormDialog
        open={productDialog.open}
        onClose={() => setProductDialog({ open: false })}
        initial={productDialog.editing}
        onSave={(data) => {
          if (productDialog.editing) {
            updateMut.mutate({ id: productDialog.editing.id, data });
          } else {
            createMut.mutate(data);
          }
        }}
      />
    </AppShell>
  );
}
