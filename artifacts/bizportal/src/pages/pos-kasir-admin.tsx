import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, Users, TrendingUp, Package, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Cashier {
  id: number;
  name: string;
  email: string;
  phone?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface ReportOrder {
  id: number;
  orderNumber: string;
  cashierName?: string;
  total: string;
  paymentMethod?: string;
  paidAt: string;
}

interface ReportData {
  orders: ReportOrder[];
  totalRevenue: number;
  byMethod: Record<string, number>;
  count: number;
}

interface DailyRow {
  date: string;
  order_count: string;
  revenue: string;
}

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  category: string;
  isActive: boolean;
  sortOrder: number;
}

interface StockItem {
  id: number;
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
  note?: string;
}

function fmt(n: number | string) {
  return Number(n).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
}

const STATUS_BADGE: Record<string, React.ReactNode> = {
  pending: <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Menunggu</Badge>,
  approved: <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Disetujui</Badge>,
  rejected: <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Ditolak</Badge>,
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai", qris: "QRIS", debit: "Debit", credit: "Kredit", transfer: "Transfer",
};

export default function PosKasirAdminPage() {
  const { toast } = useToast();

  // Cashiers
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [cashiersLoading, setCashiersLoading] = useState(false);

  // Report
  const [report, setReport] = useState<ReportData | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportLoading, setReportLoading] = useState(false);

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [productDialog, setProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", price: "", category: "minuman", isActive: true, sortOrder: 0 });

  // Stock
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stockDialog, setStockDialog] = useState(false);
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [stockForm, setStockForm] = useState({ name: "", unit: "pcs", currentStock: "0", minStock: "0", note: "" });

  const loadCashiers = useCallback(async () => {
    setCashiersLoading(true);
    try {
      const res = await fetch("/api/pos-kasir/admin/cashiers", { credentials: "include" });
      if (res.ok) setCashiers(await res.json() as Cashier[]);
    } finally { setCashiersLoading(false); }
  }, []);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const [rRes, dRes] = await Promise.all([
        fetch(`/api/pos-kasir/admin/report?from=${reportFrom}&to=${reportTo}`, { credentials: "include" }),
        fetch("/api/pos-kasir/admin/report/daily", { credentials: "include" }),
      ]);
      if (rRes.ok) setReport(await rRes.json() as ReportData);
      if (dRes.ok) setDaily(await dRes.json() as DailyRow[]);
    } finally { setReportLoading(false); }
  }, [reportFrom, reportTo]);

  const loadProducts = useCallback(async () => {
    const res = await fetch("/api/pos-kasir/products/all", { credentials: "include" });
    if (res.ok) setProducts(await res.json() as Product[]);
  }, []);

  const loadStocks = useCallback(async () => {
    const res = await fetch("/api/pos-kasir/admin/stock", { credentials: "include" });
    if (res.ok) setStocks(await res.json() as StockItem[]);
  }, []);

  useEffect(() => { loadCashiers(); loadReport(); loadProducts(); loadStocks(); }, [loadCashiers, loadReport, loadProducts, loadStocks]);

  const approveCashier = async (id: number, status: "approved" | "rejected") => {
    const res = await fetch(`/api/pos-kasir/admin/cashiers/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast({ title: status === "approved" ? "Kasir disetujui" : "Kasir ditolak" });
      loadCashiers();
    }
  };

  const saveProduct = async () => {
    const url = editingProduct ? `/api/pos-kasir/products/${editingProduct.id}` : "/api/pos-kasir/products";
    const method = editingProduct ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productForm),
    });
    if (res.ok) {
      toast({ title: editingProduct ? "Produk diperbarui" : "Produk ditambahkan" });
      setProductDialog(false);
      setEditingProduct(null);
      loadProducts();
    } else {
      toast({ title: "Gagal menyimpan produk", variant: "destructive" });
    }
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("Hapus produk ini?")) return;
    await fetch(`/api/pos-kasir/products/${id}`, { method: "DELETE", credentials: "include" });
    loadProducts();
  };

  const saveStock = async () => {
    const url = editingStock ? `/api/pos-kasir/admin/stock/${editingStock.id}` : "/api/pos-kasir/admin/stock";
    const method = editingStock ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stockForm),
    });
    if (res.ok) {
      toast({ title: editingStock ? "Stok diperbarui" : "Stok ditambahkan" });
      setStockDialog(false);
      setEditingStock(null);
      loadStocks();
    }
  };

  const deleteStock = async (id: number) => {
    if (!confirm("Hapus item stok ini?")) return;
    await fetch(`/api/pos-kasir/admin/stock/${id}`, { method: "DELETE", credentials: "include" });
    loadStocks();
  };

  const pendingCount = cashiers.filter((c) => c.status === "pending").length;

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🧋 Thai Tea CST — Admin Kasir
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manajemen kasir, menu, stok, dan laporan penjualan</p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-sm px-3 py-1.5">
              {pendingCount} kasir menunggu persetujuan
            </Badge>
          )}
        </div>

        <Tabs defaultValue="cashiers">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="cashiers" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Kasir {pendingCount > 0 && <span className="bg-yellow-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{pendingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="report" className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Laporan
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-1.5">
              🧋 Menu
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex items-center gap-1.5">
              <Package className="h-4 w-4" /> Stok
            </TabsTrigger>
          </TabsList>

          {/* ── Cashiers Tab ── */}
          <TabsContent value="cashiers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Daftar Kasir</CardTitle>
                <Button variant="outline" size="sm" onClick={loadCashiers} disabled={cashiersLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${cashiersLoading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>No. HP</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Daftar</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashiers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada kasir terdaftar</TableCell>
                      </TableRow>
                    ) : cashiers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.email}</TableCell>
                        <TableCell>{c.phone ?? "-"}</TableCell>
                        <TableCell>{STATUS_BADGE[c.status]}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {c.status !== "approved" && (
                              <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => approveCashier(c.id, "approved")}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Setujui
                              </Button>
                            )}
                            {c.status !== "rejected" && (
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => approveCashier(c.id, "rejected")}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Tolak
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Report Tab ── */}
          <TabsContent value="report" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Dari</label>
                    <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="w-36 h-8 text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Sampai</label>
                    <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="w-36 h-8 text-sm" />
                  </div>
                  <Button size="sm" onClick={loadReport} disabled={reportLoading}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${reportLoading ? "animate-spin" : ""}`} /> Tampilkan
                  </Button>
                </div>
              </CardHeader>
              {report && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <p className="text-xs text-amber-700 font-medium">Total Pendapatan</p>
                      <p className="text-xl font-bold text-amber-800 mt-1">{fmt(report.totalRevenue)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                      <p className="text-xs text-blue-700 font-medium">Jumlah Transaksi</p>
                      <p className="text-xl font-bold text-blue-800 mt-1">{report.count}</p>
                    </div>
                    {Object.entries(report.byMethod).map(([m, total]) => (
                      <div key={m} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-600 font-medium">{PAYMENT_LABELS[m] ?? m}</p>
                        <p className="text-lg font-bold text-gray-800 mt-1">{fmt(total)}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Riwayat Transaksi</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Order</TableHead>
                          <TableHead>Kasir</TableHead>
                          <TableHead>Metode</TableHead>
                          <TableHead>Waktu</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.orders.slice(0, 50).map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                            <TableCell>{o.cashierName ?? "-"}</TableCell>
                            <TableCell>{PAYMENT_LABELS[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(o.paidAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                            </TableCell>
                            <TableCell className="text-right font-medium">{fmt(o.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Daily summary */}
            {daily.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Ringkasan Harian (30 Hari Terakhir)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Jumlah Order</TableHead>
                        <TableHead className="text-right">Pendapatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {daily.map((d) => (
                        <TableRow key={d.date}>
                          <TableCell>{new Date(d.date).toLocaleDateString("id-ID", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</TableCell>
                          <TableCell>{d.order_count}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(d.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Products Tab ── */}
          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Menu Thai Tea CST</CardTitle>
                <Button size="sm" onClick={() => { setEditingProduct(null); setProductForm({ name: "", description: "", price: "", category: "minuman", isActive: true, sortOrder: 0 }); setProductDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Tambah Menu
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Harga</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{p.name}</p>
                            {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{p.category}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{fmt(p.price)}</TableCell>
                        <TableCell>
                          {p.isActive
                            ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Aktif</Badge>
                            : <Badge variant="secondary" className="text-xs">Non-aktif</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => {
                              setEditingProduct(p);
                              setProductForm({ name: p.name, description: p.description ?? "", price: p.price, category: p.category, isActive: p.isActive, sortOrder: p.sortOrder });
                              setProductDialog(true);
                            }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteProduct(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Stock Tab ── */}
          <TabsContent value="stock">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Manajemen Stok Bahan</CardTitle>
                <Button size="sm" onClick={() => { setEditingStock(null); setStockForm({ name: "", unit: "pcs", currentStock: "0", minStock: "0", note: "" }); setStockDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Tambah Bahan
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Bahan</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Min. Stok</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stocks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data stok</TableCell>
                      </TableRow>
                    ) : stocks.map((s) => {
                      const low = Number(s.currentStock) <= Number(s.minStock);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.unit}</TableCell>
                          <TableCell className={`font-bold ${low ? "text-red-600" : "text-green-600"}`}>
                            {Number(s.currentStock).toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{Number(s.minStock).toLocaleString("id-ID")}</TableCell>
                          <TableCell>
                            {low
                              ? <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">⚠️ Stok Rendah</Badge>
                              : <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Aman</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => {
                                setEditingStock(s);
                                setStockForm({ name: s.name, unit: s.unit, currentStock: s.currentStock, minStock: s.minStock, note: s.note ?? "" });
                                setStockDialog(true);
                              }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteStock(s.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Menu" : "Tambah Menu Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Nama Menu</Label>
              <Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="Thai Tea Original" />
            </div>
            <div>
              <Label className="text-xs">Deskripsi</Label>
              <Input value={productForm.description} onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))} placeholder="Opsional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Harga (Rp)</Label>
                <Input type="number" value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))} placeholder="12000" />
              </div>
              <div>
                <Label className="text-xs">Kategori</Label>
                <Select value={productForm.category} onValueChange={(v) => setProductForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minuman">Minuman</SelectItem>
                    <SelectItem value="makanan">Makanan</SelectItem>
                    <SelectItem value="topping">Topping</SelectItem>
                    <SelectItem value="paket">Paket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Urutan</Label>
                <Input type="number" value={productForm.sortOrder} onChange={(e) => setProductForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" checked={productForm.isActive}
                    onChange={(e) => setProductForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Aktif dijual</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setProductDialog(false)}>Batal</Button>
              <Button onClick={saveProduct}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Dialog */}
      <Dialog open={stockDialog} onOpenChange={setStockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStock ? "Edit Stok Bahan" : "Tambah Bahan Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Nama Bahan</Label>
              <Input value={stockForm.name} onChange={(e) => setStockForm((f) => ({ ...f, name: e.target.value }))} placeholder="Thai Tea Sachet" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Satuan</Label>
                <Input value={stockForm.unit} onChange={(e) => setStockForm((f) => ({ ...f, unit: e.target.value }))} placeholder="pcs / kg / liter" />
              </div>
              <div>
                <Label className="text-xs">Stok Awal</Label>
                <Input type="number" value={stockForm.currentStock} onChange={(e) => setStockForm((f) => ({ ...f, currentStock: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Stok Minimum (trigger peringatan)</Label>
              <Input type="number" value={stockForm.minStock} onChange={(e) => setStockForm((f) => ({ ...f, minStock: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Catatan</Label>
              <Input value={stockForm.note} onChange={(e) => setStockForm((f) => ({ ...f, note: e.target.value }))} placeholder="Opsional" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStockDialog(false)}>Batal</Button>
              <Button onClick={saveStock}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
