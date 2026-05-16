import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, Users, TrendingUp, Package, RefreshCw, Plus, Pencil, Trash2, MapPin, ImageIcon, Loader2, X, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Branch {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

interface Cashier {
  id: number;
  name: string;
  email: string;
  phone?: string;
  status: "pending" | "approved" | "rejected";
  branchId?: number | null;
  branchName?: string | null;
  createdAt: string;
}

interface ReportOrder {
  id: number;
  orderNumber: string;
  cashierName?: string;
  branchName?: string | null;
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
  imageUrl?: string | null;
  productType?: string | null;
  linkedProductId?: number | null;
  stockItemId?: number | null;
  stockUsagePerUnit?: string | null;
  stock?: string | null;
  stockUnit?: string;
}

interface InvProduct {
  id: number;
  name: string;
  sku: string;
  unit: string;
}

function resolveStoredUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  if (url.startsWith("/pos-images/")) return url;
  if (url.startsWith("/api/")) return url;
  return url;
}

interface StockItem {
  id: number;
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
  note?: string;
  branchId?: number | null;
  branchName?: string | null;
}

interface Shift {
  id: number;
  branchId: number;
  branchName?: string | null;
  cashierId: number;
  cashierName?: string | null;
  openedAt: string;
  closedAt?: string | null;
  openingCash: string;
  closingCash?: string | null;
  totalSales: string;
  orderCount: number;
  status: "open" | "closed";
  notes?: string | null;
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

  // Branches
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchDialog, setBranchDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "", isActive: true });

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
  const [reportBranchId, setReportBranchId] = useState<string>("all");
  const [reportCashierId, setReportCashierId] = useState<string>("all");

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [productDialog, setProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", price: "", category: "minuman", isActive: true, sortOrder: 0, imageUrl: "", productType: "STOCK", linkedProductId: "", stockItemId: "", stockUsagePerUnit: "1", stock: "", stockUnit: "pcs" });
  const [invProducts, setInvProducts] = useState<InvProduct[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  // Stock
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stockDialog, setStockDialog] = useState(false);
  const [editingStock, setEditingStock] = useState<StockItem | null>(null);
  const [stockForm, setStockForm] = useState({ name: "", unit: "pcs", currentStock: "0", minStock: "0", note: "", branchId: "" });
  const [stockBranchFilter, setStockBranchFilter] = useState<string>("all");

  // Shifts
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftBranchFilter, setShiftBranchFilter] = useState<string>("all");
  const [shiftFrom, setShiftFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [shiftTo, setShiftTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Settings / Logo
  const [logoUrl, setLogoUrl] = useState<string>("/thai-tea-cst-logo.jpeg");
  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/pos-kasir/settings");
    if (res.ok) {
      const s = await res.json() as Record<string, string>;
      if (s.logoUrl) setLogoUrl(s.logoUrl);
    }
  }, []);

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pos-kasir/admin/upload-image", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const e = await res.json() as { message?: string }; msg = e.message ?? msg; } catch { /* ignore */ }
        toast({ title: "Gagal upload logo", description: msg, variant: "destructive" });
        return;
      }
      const data = await res.json() as { url?: string };
      const uploadedUrl = data.url ?? "";
      const saveRes = await fetch("/api/pos-kasir/admin/settings", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: uploadedUrl }),
      });
      if (saveRes.ok) {
        setLogoUrl(uploadedUrl);
        toast({ title: "Logo berhasil diperbarui" });
      } else {
        toast({ title: "Gagal menyimpan logo", variant: "destructive" });
      }
    } finally { setLogoUploading(false); }
  };

  const loadBranches = useCallback(async () => {
    const res = await fetch("/api/pos-kasir/admin/branches", { credentials: "include" });
    if (res.ok) setBranches(await res.json() as Branch[]);
  }, []);

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
      const params = new URLSearchParams({ from: reportFrom, to: reportTo });
      if (reportBranchId && reportBranchId !== "all") params.set("branchId", reportBranchId);
      if (reportCashierId && reportCashierId !== "all") params.set("cashierId", reportCashierId);
      const dailyParams = new URLSearchParams();
      if (reportBranchId && reportBranchId !== "all") dailyParams.set("branchId", reportBranchId);
      const [rRes, dRes] = await Promise.all([
        fetch(`/api/pos-kasir/admin/report?${params}`, { credentials: "include" }),
        fetch(`/api/pos-kasir/admin/report/daily${dailyParams.size ? `?${dailyParams}` : ""}`, { credentials: "include" }),
      ]);
      if (rRes.ok) setReport(await rRes.json() as ReportData);
      if (dRes.ok) setDaily(await dRes.json() as DailyRow[]);
    } finally { setReportLoading(false); }
  }, [reportFrom, reportTo, reportBranchId, reportCashierId]);

  const loadProducts = useCallback(async () => {
    const res = await fetch(`/api/pos-kasir/products/all?_t=${Date.now()}`, { credentials: "include", cache: "no-store" });
    if (res.ok) setProducts(await res.json() as Product[]);
  }, []);

  const loadInvProducts = useCallback(async () => {
    const res = await fetch("/api/products?limit=500", { credentials: "include" });
    if (res.ok) {
      const data = await res.json() as { items?: InvProduct[]; data?: InvProduct[] } | InvProduct[];
      setInvProducts(Array.isArray(data) ? data : ((data as { items?: InvProduct[]; data?: InvProduct[] }).items ?? (data as { items?: InvProduct[]; data?: InvProduct[] }).data ?? []));
    }
  }, []);

  const loadStocks = useCallback(async (branchIdFilter?: string) => {
    const filter = branchIdFilter ?? stockBranchFilter;
    const sep = (filter && filter !== "all") ? `?branchId=${filter}&_t=${Date.now()}` : `?_t=${Date.now()}`;
    const res = await fetch(`/api/pos-kasir/admin/stock${sep}`, { credentials: "include", cache: "no-store" });
    if (res.ok) setStocks(await res.json() as StockItem[]);
  }, [stockBranchFilter]);

  const loadShifts = useCallback(async (branchFilter?: string, from?: string, to?: string) => {
    setShiftsLoading(true);
    try {
      const bFilter = branchFilter ?? shiftBranchFilter;
      const fFrom = from ?? shiftFrom;
      const fTo = to ?? shiftTo;
      const params = new URLSearchParams({ from: fFrom, to: fTo });
      if (bFilter && bFilter !== "all") params.set("branchId", bFilter);
      const res = await fetch(`/api/pos-kasir/admin/shifts?${params}`, { credentials: "include" });
      if (res.ok) setShifts(await res.json() as Shift[]);
    } finally { setShiftsLoading(false); }
  }, [shiftBranchFilter, shiftFrom, shiftTo]);

  // Quick stock adjust dialog (inline, tanpa buka full edit produk)
  const [stockAdjProduct, setStockAdjProduct] = useState<Product | null>(null);
  const [stockAdjValue, setStockAdjValue] = useState("");
  const [stockAdjSaving, setStockAdjSaving] = useState(false);

  const saveStockAdj = async () => {
    if (!stockAdjProduct) return;
    setStockAdjSaving(true);
    try {
      const res = await fetch(`/api/pos-kasir/products/${stockAdjProduct.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: stockAdjValue }),
      });
      if (res.ok) {
        toast({ title: "Stok diperbarui" });
        setStockAdjProduct(null);
        loadProducts();
      } else {
        let msg = `Error ${res.status}`;
        try { const d = await res.json() as { message?: string }; msg = d.message ?? msg; } catch { /* */ }
        toast({ title: "Gagal", description: msg, variant: "destructive" });
      }
    } finally { setStockAdjSaving(false); }
  };

  // Realtime: refresh stok, produk, dan kasir setiap 15 detik
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshRealtime = useCallback(async () => {
    await Promise.all([loadStocks(), loadCashiers(), loadProducts()]);
    setLastUpdated(new Date());
  }, [loadStocks, loadCashiers, loadProducts]);

  useEffect(() => {
    loadSettings();
    loadBranches();
    loadCashiers();
    loadReport();
    loadProducts();
    loadInvProducts();
    loadStocks().then(() => setLastUpdated(new Date()));
    loadShifts();
  }, [loadSettings, loadBranches, loadCashiers, loadReport, loadProducts, loadInvProducts, loadStocks, loadShifts]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshRealtime();
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshRealtime]);

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

  const assignBranch = async (cashierId: number, branchId: string) => {
    await fetch(`/api/pos-kasir/admin/cashiers/${cashierId}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId: branchId === "none" ? null : Number(branchId) }),
    });
    loadCashiers();
  };

  // ── Branch CRUD ──────────────────────────────────────────────────────────────

  const saveBranch = async () => {
    const url = editingBranch ? `/api/pos-kasir/admin/branches/${editingBranch.id}` : "/api/pos-kasir/admin/branches";
    const method = editingBranch ? "PATCH" : "POST";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branchForm),
    });
    if (res.ok) {
      toast({ title: editingBranch ? "Cabang diperbarui" : "Cabang ditambahkan" });
      setBranchDialog(false);
      setEditingBranch(null);
      loadBranches();
    } else {
      const d = await res.json() as { message?: string };
      toast({ title: d.message ?? "Gagal menyimpan cabang", variant: "destructive" });
    }
  };

  const deleteBranch = async (id: number) => {
    if (!confirm("Hapus cabang ini? Tidak bisa dihapus jika masih ada kasir yang terdaftar.")) return;
    const res = await fetch(`/api/pos-kasir/admin/branches/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      toast({ title: "Cabang dihapus" });
      loadBranches();
    } else {
      const d = await res.json() as { message?: string };
      toast({ title: d.message ?? "Gagal menghapus cabang", variant: "destructive" });
    }
  };

  // ── Product CRUD ─────────────────────────────────────────────────────────────

  const uploadProductImage = async (file: File) => {
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pos-kasir/admin/upload-image", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const e = await res.json() as { message?: string }; msg = e.message ?? msg; } catch { /* ignore */ }
        toast({ title: "Gagal upload gambar", description: msg, variant: "destructive" });
        return;
      }
      const data = await res.json() as { url?: string };
      setProductForm((f) => ({ ...f, imageUrl: data.url ?? "" }));
    } finally { setImageUploading(false); }
  };

  const saveProduct = async () => {
    const url = editingProduct ? `/api/pos-kasir/products/${editingProduct.id}` : "/api/pos-kasir/products";
    const method = editingProduct ? "PATCH" : "POST";
    const body = {
      ...productForm,
      stockItemId: productForm.stockItemId ? Number(productForm.stockItemId) : null,
      stockUsagePerUnit: productForm.stockUsagePerUnit ? String(productForm.stockUsagePerUnit) : "1",
      linkedProductId: productForm.linkedProductId ? Number(productForm.linkedProductId) : null,
    };
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  // ── Stock CRUD ───────────────────────────────────────────────────────────────

  const saveStock = async () => {
    const url = editingStock ? `/api/pos-kasir/admin/stock/${editingStock.id}` : "/api/pos-kasir/admin/stock";
    const method = editingStock ? "PATCH" : "POST";
    const body = {
      ...stockForm,
      branchId: stockForm.branchId ? Number(stockForm.branchId) : null,
    };
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast({ title: editingStock ? "Stok diperbarui" : "Stok ditambahkan" });
      setStockDialog(false);
      setEditingStock(null);
      loadStocks();
    } else {
      let msg = `Error ${res.status}`;
      try { const d = await res.json() as { message?: string }; msg = d.message ?? msg; } catch { /* ignore */ }
      toast({ title: "Gagal menyimpan stok", description: msg, variant: "destructive" });
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
              <img src={logoUrl} alt="Thai Tea CST" className="w-8 h-8 rounded-full object-cover bg-orange-500" />
              Thai Tea CST — Admin Kasir
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manajemen cabang, kasir, menu, stok, dan laporan penjualan</p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-sm px-3 py-1.5">
              {pendingCount} kasir menunggu persetujuan
            </Badge>
          )}
        </div>

        <Tabs defaultValue="branches">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="branches" className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> Cabang
            </TabsTrigger>
            <TabsTrigger value="cashiers" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Kasir {pendingCount > 0 && <span className="bg-yellow-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{pendingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="shifts" className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Shift
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
            <TabsTrigger value="settings" className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" /> Pengaturan
            </TabsTrigger>
          </TabsList>

          {/* ── Branches Tab ── */}
          <TabsContent value="branches">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Daftar Cabang</CardTitle>
                <Button size="sm" onClick={() => {
                  setEditingBranch(null);
                  setBranchForm({ name: "", address: "", phone: "", isActive: true });
                  setBranchDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-1" /> Tambah Cabang
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Cabang</TableHead>
                      <TableHead>Alamat</TableHead>
                      <TableHead>Telepon</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kasir</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada cabang</TableCell>
                      </TableRow>
                    ) : branches.map((b) => {
                      const kasirCount = cashiers.filter((c) => c.branchId === b.id).length;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{b.address || "-"}</TableCell>
                          <TableCell className="text-sm">{b.phone || "-"}</TableCell>
                          <TableCell>
                            {b.isActive
                              ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Aktif</Badge>
                              : <Badge variant="secondary" className="text-xs">Non-aktif</Badge>}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{kasirCount} kasir</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => {
                                setEditingBranch(b);
                                setBranchForm({ name: b.name, address: b.address ?? "", phone: b.phone ?? "", isActive: b.isActive });
                                setBranchDialog(true);
                              }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteBranch(b.id)}>
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
                      <TableHead>Cabang</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Daftar</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashiers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada kasir terdaftar</TableCell>
                      </TableRow>
                    ) : cashiers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.email}</TableCell>
                        <TableCell>{c.phone ?? "-"}</TableCell>
                        <TableCell>
                          <Select
                            value={c.branchId ? String(c.branchId) : "none"}
                            onValueChange={(v) => assignBranch(c.id, v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-36">
                              <SelectValue placeholder="— Pilih —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Tidak ada —</SelectItem>
                              {branches.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
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

          {/* ── Shifts Tab ── */}
          <TabsContent value="shifts" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-base">Riwayat Shift Kasir</CardTitle>
                  <div className="flex items-center gap-2 ml-auto">
                    <label className="text-sm font-medium">Dari</label>
                    <Input type="date" value={shiftFrom} onChange={(e) => setShiftFrom(e.target.value)} className="w-36 h-8 text-sm" />
                    <label className="text-sm font-medium">s/d</label>
                    <Input type="date" value={shiftTo} onChange={(e) => setShiftTo(e.target.value)} className="w-36 h-8 text-sm" />
                    <Select value={shiftBranchFilter} onValueChange={setShiftBranchFilter}>
                      <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Semua Cabang" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Cabang</SelectItem>
                        {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => loadShifts()} disabled={shiftsLoading}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${shiftsLoading ? "animate-spin" : ""}`} /> Tampilkan
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal Buka</TableHead>
                      <TableHead>Kasir</TableHead>
                      <TableHead>Cabang</TableHead>
                      <TableHead className="text-right">Modal Awal</TableHead>
                      <TableHead className="text-right">Total Penjualan</TableHead>
                      <TableHead className="text-right">Order</TableHead>
                      <TableHead className="text-right">Kas Penutup</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tutup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          {shiftsLoading ? "Memuat..." : "Belum ada data shift"}
                        </TableCell>
                      </TableRow>
                    ) : shifts.map((s) => {
                      const selisih = s.closingCash !== null && s.closingCash !== undefined
                        ? Number(s.closingCash) - Number(s.totalSales)
                        : null;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm font-mono">
                            {new Date(s.openedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{s.cashierName ?? "-"}</TableCell>
                          <TableCell className="text-sm">{s.branchName ?? "-"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(s.openingCash)}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{fmt(s.totalSales)}</TableCell>
                          <TableCell className="text-right text-sm">{s.orderCount}</TableCell>
                          <TableCell className="text-right text-sm">
                            {s.closingCash !== null && s.closingCash !== undefined ? fmt(s.closingCash) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {selisih !== null ? (
                              <span className={selisih >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                                {selisih >= 0 ? "+" : ""}{fmt(selisih)}
                              </span>
                            ) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            {s.status === "open"
                              ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><Clock className="h-3 w-3 mr-1" />Aktif</Badge>
                              : <Badge variant="secondary" className="text-xs">Tutup</Badge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.closedAt ? new Date(s.closedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Cabang</label>
                    <Select value={reportBranchId} onValueChange={setReportBranchId}>
                      <SelectTrigger className="w-36 h-8 text-sm">
                        <SelectValue placeholder="Semua" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Cabang</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Kasir</label>
                    <Select value={reportCashierId} onValueChange={setReportCashierId}>
                      <SelectTrigger className="w-36 h-8 text-sm">
                        <SelectValue placeholder="Semua" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Kasir</SelectItem>
                        {cashiers.filter((c) => c.status === "approved").map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.branchName ? `(${c.branchName})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                          <TableHead>Cabang</TableHead>
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
                            <TableCell className="text-xs text-muted-foreground">{o.branchName ?? "-"}</TableCell>
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
                <Button size="sm" onClick={() => {
                  setEditingProduct(null);
                  setProductForm({ name: "", description: "", price: "", category: "minuman", isActive: true, sortOrder: 0, imageUrl: "", productType: "STOCK", linkedProductId: "", stockItemId: "", stockUsagePerUnit: "1", stock: "", stockUnit: "pcs" });
                  setProductDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-1" /> Tambah Menu
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Gambar</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Harga</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {resolveStoredUrl(p.imageUrl) ? (
                            <img src={resolveStoredUrl(p.imageUrl)!} alt={p.name} className="w-10 h-10 object-cover rounded-md border" />
                          ) : (
                            <div className="w-10 h-10 rounded-md border bg-muted flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
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
                          <div className="flex items-center gap-1.5">
                            {p.stock != null
                              ? <span className={`text-xs font-semibold ${Number(p.stock) <= 0 ? "text-red-600" : Number(p.stock) <= 5 ? "text-orange-500" : "text-green-700"}`}>{Number(p.stock)} {p.stockUnit ?? "pcs"}</span>
                              : <span className="text-xs text-muted-foreground">—</span>}
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-orange-500 hover:bg-orange-50" title="Atur Stok"
                              onClick={() => { setStockAdjProduct(p); setStockAdjValue(p.stock != null ? String(Number(p.stock)) : "0"); }}>
                              <span className="text-xs font-black">+</span>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {p.isActive
                            ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Aktif</Badge>
                            : <Badge variant="secondary" className="text-xs">Non-aktif</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => {
                              setEditingProduct(p);
                              setProductForm({ name: p.name, description: p.description ?? "", price: p.price, category: p.category, isActive: p.isActive, sortOrder: p.sortOrder, imageUrl: p.imageUrl ?? "", productType: p.productType ?? "STOCK", linkedProductId: p.linkedProductId ? String(p.linkedProductId) : "", stockItemId: p.stockItemId ? String(p.stockItemId) : "", stockUsagePerUnit: p.stockUsagePerUnit ?? "1", stock: p.stock != null ? String(p.stock) : "", stockUnit: p.stockUnit ?? "pcs" });
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
                <div>
                  <CardTitle className="text-base">Stok Bahan Baku (Raw Material)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Untuk melacak bahan mentah (bukan stok produk jadi). Stok produk dikelola di tab Menu ↑</p>
                  {lastUpdated && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Diperbarui: {lastUpdated.toLocaleTimeString("id-ID")} · Auto-refresh tiap 15 detik
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs font-medium">Filter Cabang:</label>
                    <Select value={stockBranchFilter} onValueChange={(v) => { setStockBranchFilter(v); loadStocks(v); }}>
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Semua" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Cabang</SelectItem>
                        {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" onClick={() => {
                  setEditingStock(null);
                  setStockForm({ name: "", unit: "pcs", currentStock: "0", minStock: "0", note: "", branchId: stockBranchFilter !== "all" ? stockBranchFilter : "" });
                  setStockDialog(true);
                }}>
                  <Plus className="h-4 w-4 mr-1" /> Tambah Bahan
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Bahan</TableHead>
                      <TableHead>Cabang</TableHead>
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
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada data stok{stockBranchFilter !== "all" ? " untuk cabang ini" : ""}</TableCell>
                      </TableRow>
                    ) : stocks.map((s) => {
                      const low = Number(s.currentStock) <= Number(s.minStock);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.branchName ? <Badge variant="outline" className="text-xs">{s.branchName}</Badge> : <span className="text-gray-300">—</span>}
                          </TableCell>
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
                                setStockForm({ name: s.name, unit: s.unit, currentStock: s.currentStock, minStock: s.minStock, note: s.note ?? "", branchId: s.branchId ? String(s.branchId) : "" });
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

          {/* ── Settings Tab ── */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pengaturan Tampilan Kasir</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium text-gray-700">Logo Saat Ini</p>
                    <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-gray-200 bg-orange-50 flex items-center justify-center">
                      <img src={logoUrl} alt="Logo Thai Tea CST" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/thai-tea-cst-logo.jpeg"; }} />
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 pt-6">
                    <p className="text-sm text-muted-foreground">
                      Upload gambar baru untuk mengganti logo Thai Tea CST. Logo ini akan tampil di halaman kasir, struk, dan header admin.
                    </p>
                    <p className="text-xs text-muted-foreground">Format: JPG, PNG, WEBP. Ukuran disarankan: 200×200 px.</p>
                    <div className="flex gap-2 items-center">
                      <input
                        ref={logoFileRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
                      />
                      <Button
                        onClick={() => logoFileRef.current?.click()}
                        disabled={logoUploading}
                        className="flex items-center gap-2"
                      >
                        {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                        {logoUploading ? "Mengupload..." : "Ganti Logo"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Branch Dialog */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBranch ? "Edit Cabang" : "Tambah Cabang Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Nama Cabang <span className="text-red-500">*</span></Label>
              <Input value={branchForm.name} onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))} placeholder="Pusat / Cabang A" />
            </div>
            <div>
              <Label className="text-xs">Alamat <span className="text-gray-400 font-normal">(opsional)</span></Label>
              <Input value={branchForm.address} onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))} placeholder="Jl. Contoh No. 1" />
            </div>
            <div>
              <Label className="text-xs">Telepon <span className="text-gray-400 font-normal">(opsional)</span></Label>
              <Input value={branchForm.phone} onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))} placeholder="08xxxxxxxxxx" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" checked={branchForm.isActive}
                onChange={(e) => setBranchForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4"
                id="branch-active"
              />
              <label htmlFor="branch-active" className="text-sm cursor-pointer">Cabang aktif</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBranchDialog(false)}>Batal</Button>
              <Button onClick={saveBranch} disabled={!branchForm.name.trim()}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <div>
              <Label className="text-xs">Gambar Produk</Label>
              <input
                ref={imageFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadProductImage(f);
                  e.target.value = "";
                }}
              />
              {resolveStoredUrl(productForm.imageUrl) ? (
                <div className="relative w-24 h-24 mt-1">
                  <img
                    src={resolveStoredUrl(productForm.imageUrl)!}
                    alt="preview"
                    className="w-24 h-24 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow border p-0.5 hover:bg-red-50"
                    onClick={() => setProductForm((f) => ({ ...f, imageUrl: "" }))}
                  >
                    <X className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 w-full"
                  disabled={imageUploading}
                  onClick={() => imageFileRef.current?.click()}
                >
                  {imageUploading
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Mengunggah…</>
                    : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Pilih Gambar</>}
                </Button>
              )}
              {resolveStoredUrl(productForm.imageUrl) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-xs"
                  disabled={imageUploading}
                  onClick={() => imageFileRef.current?.click()}
                >
                  {imageUploading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Mengunggah…</> : "Ganti Gambar"}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Stok Awal</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Kosongkan jika tidak dilacak"
                  value={productForm.stock}
                  onChange={(e) => setProductForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Satuan Stok</Label>
                <Input
                  placeholder="pcs, cup, botol…"
                  value={productForm.stockUnit}
                  onChange={(e) => setProductForm((f) => ({ ...f, stockUnit: e.target.value }))}
                />
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
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipe Stok</p>
              <div>
                <Label className="text-xs">Tipe Produk</Label>
                <Select
                  value={productForm.productType}
                  onValueChange={(v) => setProductForm((f) => ({ ...f, productType: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STOCK">STOCK — kurangi stok langsung dari gudang</SelectItem>
                    <SelectItem value="RECIPE">RECIPE — kurangi bahan baku sesuai resep</SelectItem>
                    <SelectItem value="SERVICE">SERVICE — tanpa pengurangan stok</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {productForm.productType === "STOCK" && "Pilih Produk Inventory di bawah sebagai sumber stok."}
                  {productForm.productType === "RECIPE" && "Pilih Produk Inventory yang memiliki Resep aktif. Bahan baku resep akan dikurangi saat terjual."}
                  {productForm.productType === "SERVICE" && "Produk layanan — tidak ada stok yang dikurangi."}
                </p>
              </div>
              {/* Link ke produk inventory (baru) */}
              {productForm.productType !== "SERVICE" && (
              <div>
                <Label className="text-xs">Produk Inventory Terkait</Label>
                <Select
                  value={productForm.linkedProductId || "none"}
                  onValueChange={(v) => setProductForm((f) => ({ ...f, linkedProductId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="— Tidak ada (tidak mengurangi inv. stok) —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tidak ada —</SelectItem>
                    {invProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        [{p.sku}] {p.name} ({p.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {productForm.linkedProductId && (
                  <p className="text-xs text-green-600 mt-1">
                    Setiap penjualan akan mengurangi stok gudang cabang untuk produk ini.
                  </p>
                )}
              </div>
              )}
              {/* Bahan stok (sistem lama) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Bahan Stok Terkait (lama)</Label>
                  <Select value={productForm.stockItemId || "none"} onValueChange={(v) => setProductForm((f) => ({ ...f, stockItemId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Tidak ada —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Tidak ada —</SelectItem>
                      {stocks.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Pemakaian per Porsi</Label>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={productForm.stockUsagePerUnit}
                    onChange={(e) => setProductForm((f) => ({ ...f, stockUsagePerUnit: e.target.value }))}
                    disabled={!productForm.stockItemId}
                    placeholder="1"
                  />
                </div>
              </div>
              {productForm.stockItemId && (
                <p className="text-xs text-muted-foreground">
                  Setiap 1 porsi terjual akan memotong <strong>{productForm.stockUsagePerUnit}</strong> {stocks.find((s) => String(s.id) === productForm.stockItemId)?.unit ?? ""} dari stok bahan tersebut.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setProductDialog(false)}>Batal</Button>
              <Button onClick={saveProduct} disabled={imageUploading}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Stock Adjust Dialog */}
      <Dialog open={!!stockAdjProduct} onOpenChange={(o) => { if (!o) setStockAdjProduct(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Atur Stok Produk</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground truncate">{stockAdjProduct?.name}</p>
            <div>
              <Label className="text-xs">Stok Baru (jumlah absolut)</Label>
              <Input type="number" min="0" value={stockAdjValue}
                onChange={(e) => setStockAdjValue(e.target.value)}
                placeholder="0" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                Stok saat ini: <strong>{stockAdjProduct?.stock != null ? Number(stockAdjProduct.stock).toLocaleString("id-ID") : "–"} {stockAdjProduct?.stockUnit ?? "pcs"}</strong>
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setStockAdjProduct(null)}>Batal</Button>
              <Button size="sm" onClick={saveStockAdj} disabled={stockAdjSaving}>
                {stockAdjSaving ? "Menyimpan..." : "Simpan"}
              </Button>
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
              <Label className="text-xs">Cabang <span className="text-red-500">*</span></Label>
              <Select value={stockForm.branchId || "none"} onValueChange={(v) => setStockForm((f) => ({ ...f, branchId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Pilih Cabang —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Pilih Cabang —</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-0.5">Stok ini hanya berlaku untuk cabang yang dipilih</p>
            </div>
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
              <Button onClick={saveStock} disabled={!stockForm.branchId}>Simpan</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
