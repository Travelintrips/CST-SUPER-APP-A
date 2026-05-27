import { AppShell } from "@/components/layout/AppShell";
import { useCodeCheck } from "@/hooks/useCodeCheck";
import { CodeCheckIndicator } from "@/components/ui/code-check-indicator";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListProductCategories,
  useListTaxes,
  getListProductsQueryKey,
  getListProductCategoriesQueryKey,
  type Product,
  type AccountingTax,
  type MediaItem,
} from "@workspace/api-client-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Package, Wrench, RefreshCw, ImageIcon, X, Video, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const DEFAULT_SUBCATEGORIES = [
  "Udara", "Laut", "Darat", "Pabean", "Handling",
  "Trucking", "Container", "Freight Forwarding", "Lainnya",
];

const UNITS = ["pcs", "kg", "cbm", "container", "shipment", "dokumen", "trip", "ton", "hari"];

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const _BP_USD_KEY = "cst_usd_idr_rate";
const _BP_USD_TTL = 6 * 60 * 60 * 1000;
const _BP_USD_FALLBACK = 16_300;

function _readBpRate(): { rate: number; fresh: boolean } {
  try {
    const raw = localStorage.getItem(_BP_USD_KEY);
    if (raw) {
      const { rate, ts } = JSON.parse(raw) as { rate: number; ts: number };
      if (rate > 1000) return { rate, fresh: Date.now() - ts < _BP_USD_TTL };
    }
  } catch { /* ignore */ }
  return { rate: _BP_USD_FALLBACK, fresh: false };
}

function useUsdRate(): number {
  const [rate, setRate] = useState<number>(() => _readBpRate().rate);
  useEffect(() => {
    const { fresh } = _readBpRate();
    if (fresh) return;
    fetch("/api/ecommerce/usd-idr-rate")
      .then((r) => r.json())
      .then((data: { rate: number }) => {
        const idrRate = data?.rate ?? 0;
        if (idrRate > 1000) {
          localStorage.setItem(_BP_USD_KEY, JSON.stringify({ rate: idrRate, ts: Date.now() }));
          setRate(idrRate);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);
  return rate;
}

interface ItemForm {
  name: string;
  sku: string;
  itemType: "barang" | "jasa";
  categories: string[];
  subcategory: string;
  unit: string;
  unitOptions: string[];
  price: string;
  stock: string;
  defaultSalesTaxId: string;
  defaultPurchaseTaxId: string;
  isActive: boolean;
  description: string;
  imageUrl: string;
  mediaItems: MediaItem[];
}

interface ImportRow {
  nama: string;
  sku: string;
  tipe: string;
  kategori: string;
  satuan: string;
  harga: string;
  stok: string;
  subkategori: string;
  deskripsi: string;
  aktif: string;
}

interface ImportResult {
  row: number;
  sku?: string;
  name?: string;
  status: "created" | "updated" | "error";
  message?: string;
}

const IMPORT_COLS: (keyof ImportRow)[] = ["nama", "sku", "tipe", "kategori", "satuan", "harga", "stok", "subkategori", "deskripsi", "aktif"];
const IMPORT_HEADERS = ["Nama Produk*", "SKU*", "Jenis (barang/jasa)*", "Kategori* (pisah ;)", "Satuan*", "Harga*", "Stok", "Sub-kategori", "Deskripsi", "Aktif (ya/tidak)"];

const emptyForm = (): ItemForm => ({
  name: "",
  sku: "",
  itemType: "barang",
  categories: [],
  subcategory: "",
  unit: "pcs",
  unitOptions: [],
  price: "0",
  stock: "0",
  defaultSalesTaxId: "",
  defaultPurchaseTaxId: "",
  isActive: true,
  description: "",
  imageUrl: "",
  mediaItems: [],
});

function parseMediaItems(raw: MediaItem[] | string | null | undefined): MediaItem[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is MediaItem => !!x && typeof x.url === "string");
  } catch { return []; }
}

function resolveMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

const ALLOWED_IMG_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5MB

function validateMediaFile(file: File, type: "image" | "video"): string | null {
  if (type === "image") {
    if (!ALLOWED_IMG_TYPES.includes(file.type)) {
      return `${file.name}: Format tidak didukung. Gunakan JPG, JPEG, PNG, atau WEBP.`;
    }
    if (file.size > MAX_IMG_SIZE) {
      return `${file.name}: Ukuran file melebihi batas maksimum 5MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`;
    }
  }
  return null;
}

async function uploadMediaFiles(files: File[], type: "image" | "video"): Promise<MediaItem[]> {
  for (const file of files) {
    const err = validateMediaFile(file, type);
    if (err) throw new Error(err);
  }
  const results: MediaItem[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/storage/uploads/file", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error ?? `Gagal mengunggah ${file.name} (${res.status})`);
    }
    const { url } = await res.json() as { url: string; objectPath: string };
    results.push({ type, url });
  }
  return results;
}

function formFromProduct(p: Product): ItemForm {
  return {
    name: p.name,
    sku: p.sku,
    itemType: p.itemType as "barang" | "jasa",
    categories: p.categories ?? [],
    subcategory: p.subcategory ?? "",
    unit: p.unit,
    unitOptions: Array.isArray(p.unitOptions) ? (p.unitOptions ?? []) : [],
    price: String(p.price),
    stock: String(p.stock ?? 0),
    defaultSalesTaxId: p.defaultSalesTaxId ? String(p.defaultSalesTaxId) : "",
    defaultPurchaseTaxId: p.defaultPurchaseTaxId ? String(p.defaultPurchaseTaxId) : "",
    isActive: p.isActive,
    description: p.description ?? "",
    imageUrl: p.imageUrl ?? "",
    mediaItems: parseMediaItems(p.mediaItems),
  };
}

export default function SalesItemsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const usdIdrRate = useUsdRate();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "barang" | "jasa">("all");
  const [filterSubcat, setFilterSubcat] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("active");

  const { data: products = [], isLoading } = useListProducts(
    {},
    { query: { queryKey: getListProductsQueryKey({}) } }
  );
  const { data: categories = [] } = useListProductCategories();
  const { data: taxes = [] } = useListTaxes();

  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const downloadImportTemplate = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Template Import");
    ws.addRow(IMPORT_HEADERS);
    ws.getRow(1).font = { bold: true };
    ws.addRow(["Pengiriman Udara", "SVC-AIR-001", "jasa", "Udara", "shipment", "5000000", "0", "Udara", "Layanan pengiriman udara internasional", "ya"]);
    ws.addRow(["Pengiriman Laut FCL", "SVC-SEA-001", "jasa", "Laut", "container", "8000000", "0", "Laut", "Full Container Load (FCL)", "ya"]);
    ws.addRow(["Karton Box 40x30x30", "PRD-BOX-001", "barang", "Handling", "pcs", "25000", "100", "Handling", "Karton box tebal double wall", "ya"]);
    ws.columns = IMPORT_HEADERS.map((h, i) => ({ header: h, width: Math.max(h.length + 2, [20, 15, 12, 20, 10, 10, 6, 14, 30, 8][i] ?? 14) }));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-produk.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseImportFile = async (file: File): Promise<ImportRow[]> => {
    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    if (isXlsx) {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Worksheet tidak ditemukan dalam file Excel");
      const headerRow = ws.getRow(1).values as (string | undefined)[];
      const headers = (Array.isArray(headerRow) ? headerRow : []).slice(1).map((h) => String(h ?? "").trim().toLowerCase()
        .replace("nama produk*", "nama").replace("sku*", "sku").replace("jenis (barang/jasa)*", "tipe")
        .replace("kategori* (pisah ;)", "kategori").replace("satuan*", "satuan").replace("harga*", "harga")
        .replace("stok", "stok").replace("sub-kategori", "subkategori").replace("deskripsi", "deskripsi")
        .replace("aktif (ya/tidak)", "aktif")
      );
      const rows: ImportRow[] = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const vals = (row.values as unknown[]).slice(1);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(vals[i] ?? "").trim(); });
        if (!obj.nama && !obj.sku) return;
        rows.push({
          nama: obj.nama ?? "", sku: obj.sku ?? "", tipe: obj.tipe ?? "barang",
          kategori: obj.kategori ?? "", satuan: obj.satuan ?? "pcs", harga: obj.harga ?? "0",
          stok: obj.stok ?? "0", subkategori: obj.subkategori ?? "", deskripsi: obj.deskripsi ?? "", aktif: obj.aktif ?? "ya",
        });
      });
      return rows;
    } else {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error("File CSV kosong atau hanya berisi header");
      const sep = lines[0].includes("\t") ? "\t" : ",";
      const parse = (line: string) => line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const hdrs = parse(lines[0]).map((h) => h.toLowerCase()
        .replace("nama produk*", "nama").replace("sku*", "sku").replace("jenis (barang/jasa)*", "tipe")
        .replace("kategori* (pisah ;)", "kategori").replace("satuan*", "satuan").replace("harga*", "harga")
        .replace("sub-kategori", "subkategori").replace("aktif (ya/tidak)", "aktif")
      );
      return lines.slice(1).map((line) => {
        const vals = parse(line);
        const obj: Record<string, string> = {};
        hdrs.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return {
          nama: obj.nama ?? "", sku: obj.sku ?? "", tipe: obj.tipe ?? "barang",
          kategori: obj.kategori ?? "", satuan: obj.satuan ?? "pcs", harga: obj.harga ?? "0",
          stok: obj.stok ?? "0", subkategori: obj.subkategori ?? "", deskripsi: obj.deskripsi ?? "", aktif: obj.aktif ?? "ya",
        };
      }).filter((r) => r.nama || r.sku);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportResults(null);
    try {
      const rows = await parseImportFile(file);
      if (rows.length === 0) { setImportError("Tidak ada baris data yang ditemukan dalam file"); return; }
      if (rows.length > 500) { setImportError("Maksimum 500 baris per import"); return; }
      setImportRows(rows);
    } catch (e) {
      setImportError(String(e));
    }
    e.target.value = "";
  };

  const handleDoImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportResults(null);
    try {
      const res = await fetch("/api/ecommerce/products/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json() as { results?: ImportResult[]; message?: string };
      if (!res.ok) { setImportError(data.message ?? "Terjadi kesalahan pada server"); return; }
      setImportResults(data.results ?? []);
      const success = (data.results ?? []).filter((r) => r.status !== "error").length;
      const errors = (data.results ?? []).filter((r) => r.status === "error").length;
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      toast({ title: `Import selesai: ${success} berhasil, ${errors} gagal` });
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleUploadMedia = async (files: File[], type: "image" | "video") => {
    setUploading(true);
    try {
      const newItems = await uploadMediaFiles(files, type);
      setForm((f) => {
        const updated = [...f.mediaItems, ...newItems];
        const firstImage = updated.find((m) => m.type === "image");
        return {
          ...f,
          mediaItems: updated,
          imageUrl: firstImage ? firstImage.url : f.imageUrl,
        };
      });
      toast({ title: `${newItems.length} ${type === "image" ? "foto" : "video"} berhasil diunggah` });
    } catch (e) {
      toast({ title: "Gagal mengunggah", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Kumpulkan semua sub-kategori unik dari produk yang ada (+ default)
  const allSubcategories = useMemo(() => {
    const fromProducts = products
      .map((p) => p.subcategory)
      .filter((s): s is string => !!s && s.trim() !== "");
    const merged = Array.from(new Set([...DEFAULT_SUBCATEGORIES, ...fromProducts]));
    return merged.sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filterType !== "all" && p.itemType !== filterType) return false;
      if (filterSubcat !== "all" && p.subcategory !== filterSubcat) return false;
      if (filterActive === "active" && !p.isActive) return false;
      if (filterActive === "inactive" && p.isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, filterType, filterSubcat, filterActive, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm(formFromProduct(p));
    setDialogOpen(true);
  };

  const setF = <K extends keyof ItemForm>(key: K, val: ItemForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const skuCheckUrl = dialogOpen && form.sku.trim()
    ? `/api/ecommerce/products/check-sku?sku=${encodeURIComponent(form.sku)}${editingId ? `&excludeId=${editingId}` : ""}`
    : null;
  const { checking: skuChecking, taken: skuTaken } = useCodeCheck(skuCheckUrl, form.sku);

  const validate = (): string | null => {
    if (!form.name.trim()) return "Nama item wajib diisi";
    if (!form.sku.trim()) return "SKU/Kode item wajib diisi";
    if (!form.unit) return "Satuan wajib dipilih";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ title: t.common.error, variant: "destructive" }); return; }

    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      categories: form.categories.length > 0 ? form.categories : (form.subcategory ? [form.subcategory] : []),
      description: form.description || null,
      itemType: form.itemType,
      unit: form.unit,
      unitOptions: form.unitOptions,
      subcategory: form.subcategory || null,
      isActive: form.isActive,
      defaultSalesTaxId: form.defaultSalesTaxId ? Number(form.defaultSalesTaxId) : null,
      defaultPurchaseTaxId: form.defaultPurchaseTaxId ? Number(form.defaultPurchaseTaxId) : null,
      imageUrl: form.imageUrl.trim() || null,
      mediaItems: form.mediaItems.filter((m) => m.url.trim()),
    };

    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, data: body });
        toast({ title: t.common.success });
      } else {
        await createMut.mutateAsync({ data: body });
        toast({ title: t.common.success });
      }
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      qc.invalidateQueries({ queryKey: getListProductCategoriesQueryKey() });
      setDialogOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e);
      toast({ title: t.common.error, description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id });
      toast({ title: t.common.success });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e);
      toast({ title: t.common.error, description: msg, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSeedItems = async () => {
    setSeeding(true);
    try {
      const resp = await fetch("/api/ecommerce/seed-items", { method: "POST" });
      const data = await resp.json();
      toast({ title: t.common.success });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      qc.invalidateQueries({ queryKey: getListProductCategoriesQueryKey() });
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const taxName = (id: number | null | undefined) => {
    if (!id) return "-";
    const t = taxes.find((x) => x.id === id);
    return t ? `${t.name} (${t.rate}%)` : String(id);
  };

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Master Item Penjualan</h1>
            <p className="text-sm text-slate-400 mt-0.5">Kelola barang & jasa untuk Sales Order</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={handleSeedItems}
              disabled={seeding}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${seeding ? "animate-spin" : ""}`} />
              Seed Item Awal
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-700 text-emerald-400 hover:bg-emerald-900/40"
              onClick={() => { setImportOpen(true); setImportRows([]); setImportResults(null); setImportError(null); }}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Import Excel/CSV
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> Tambah Item
            </Button>
          </div>
        </div>

        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex gap-3 flex-wrap items-end">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Cari nama atau SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 bg-slate-900/50 border-slate-600 text-slate-200 placeholder:text-slate-500"
                />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
                <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Jenis" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  <SelectItem value="barang">Barang</SelectItem>
                  <SelectItem value="jasa">Jasa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSubcat} onValueChange={setFilterSubcat}>
                <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Sub-kategori" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">Semua Sub-kategori</SelectItem>
                  {allSubcategories.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterActive} onValueChange={(v) => setFilterActive(v as typeof filterActive)}>
                <SelectTrigger className="w-[130px] bg-slate-900/50 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full bg-slate-700/50" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                <img src="/images/logo.png" alt="CST Logistics" className="h-10 w-auto object-contain opacity-50" />
                <p className="text-sm">
                  {products.length === 0 ? 'Belum ada item. Klik "Seed Item Awal" untuk mengisi contoh data.' : "Tidak ada item yang cocok dengan filter."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400">Nama Item</TableHead>
                      <TableHead className="text-slate-400">SKU</TableHead>
                      <TableHead className="text-slate-400">Jenis</TableHead>
                      <TableHead className="text-slate-400">Sub-kategori</TableHead>
                      <TableHead className="text-slate-400">Satuan</TableHead>
                      <TableHead className="text-slate-400 text-right">Stok</TableHead>
                      <TableHead className="text-slate-400 text-right">Harga Jual</TableHead>
                      <TableHead className="text-slate-400">Pajak Jual</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id} className="border-slate-700/50">
                        <TableCell className="text-slate-200 font-medium">
                          <div className="flex items-center gap-2.5">
                            {p.imageUrl ? (
                              <img
                                src={resolveMediaUrl(p.imageUrl)}
                                alt={p.name}
                                className="h-8 w-8 rounded object-cover shrink-0 border border-slate-700"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              p.itemType === "jasa" ? (
                                <Wrench className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                              ) : (
                                <Package className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              )
                            )}
                            {p.name}
                          </div>
                          {p.description && (
                            <p className="text-xs text-slate-500 mt-0.5 max-w-[220px] truncate">{p.description}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs font-mono">{p.sku}</TableCell>
                        <TableCell>
                          {p.itemType === "jasa" ? (
                            <Badge className="bg-blue-900/40 text-blue-300 border-blue-700 text-xs">Jasa</Badge>
                          ) : (
                            <Badge className="bg-amber-900/40 text-amber-300 border-amber-700 text-xs">Barang</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">{p.subcategory ?? "-"}</TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          <div className="flex flex-wrap gap-1 items-center">
                            <span>{p.unit}</span>
                            {p.itemType === "barang" && Array.isArray(p.unitOptions) && (p.unitOptions ?? []).length > 0 && (
                              (p.unitOptions ?? []).filter((u) => u !== p.unit).map((u) => (
                                <Badge key={u} className="text-[9px] px-1 py-0 h-4 bg-slate-700 text-slate-300 border-slate-600">{u}</Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-300">
                          {p.itemType === "barang"
                            ? <span className={(p.stock ?? 0) === 0 ? "text-red-400" : ""}>
                                {p.stock ?? 0}
                              </span>
                            : <span className="text-slate-500 text-xs">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-300">
                          {p.price > 0 ? (
                            <div>
                              <div>{idr(p.price)}</div>
                              <div className="text-[11px] text-slate-500 font-normal">≈ {usd(p.price / usdIdrRate)}</div>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs">{taxName(p.defaultSalesTaxId)}</TableCell>
                        <TableCell>
                          {p.isActive ? (
                            <Badge className="bg-green-900/40 text-green-300 border-green-700 text-xs">Aktif</Badge>
                          ) : (
                            <Badge className="bg-slate-700/60 text-slate-400 border-slate-600 text-xs">Nonaktif</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-slate-400 hover:text-slate-200"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-slate-400 hover:text-red-400"
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Item" : "Tambah Item Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Nama Item *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                  placeholder="Nama item"
                  className="bg-slate-800 border-slate-600 text-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">SKU / Kode Item *</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setF("sku", e.target.value)}
                  placeholder="SVC-001"
                  className={`bg-slate-800 border-slate-600 text-slate-200${skuTaken === true ? " border-destructive" : ""}`}
                />
                <CodeCheckIndicator checking={skuChecking} taken={skuTaken} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Jenis Item *</Label>
                <Select value={form.itemType} onValueChange={(v) => setF("itemType", v as "barang" | "jasa")}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="barang">Barang</SelectItem>
                    <SelectItem value="jasa">Jasa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">
                  Jenis / Sub-kategori
                  <span className="ml-1 text-xs font-normal text-slate-500">(bebas ketik atau pilih)</span>
                </Label>
                <datalist id="subcat-list">
                  {allSubcategories.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <Input
                  list="subcat-list"
                  value={form.subcategory}
                  onChange={(e) => setF("subcategory", e.target.value)}
                  placeholder="cth: Ekspedisi Khusus, Cold Chain…"
                  className="bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500"
                />
                {form.subcategory && !DEFAULT_SUBCATEGORIES.includes(form.subcategory) && (
                  <p className="text-xs text-blue-400 flex items-center gap-1 mt-0.5">
                    <Plus className="h-3 w-3" /> Jenis baru: <strong>{form.subcategory}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Harga Jual Default</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => setF("price", e.target.value)}
                  placeholder="0"
                  className="bg-slate-800 border-slate-600 text-slate-200"
                />
              </div>
              {form.itemType === "barang" && (
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Stok</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setF("stock", e.target.value)}
                    placeholder="0"
                    className="bg-slate-800 border-slate-600 text-slate-200"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Satuan Default *</Label>
              <Select value={form.unit} onValueChange={(v) => setF("unit", v)}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit Options — multi-pilih untuk customer portal */}
            {form.itemType === "barang" && (
              <div className="space-y-2">
                <Label className="text-slate-300">
                  Pilihan Satuan untuk Pelanggan
                  <span className="ml-1 text-xs font-normal text-slate-500">(tampil di portal saat pemesanan)</span>
                </Label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-slate-800/80 border border-slate-600">
                  {UNITS.map((u) => {
                    const checked = form.unitOptions.includes(u);
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setF("unitOptions", checked
                            ? form.unitOptions.filter((x) => x !== u)
                            : [...form.unitOptions, u]
                          );
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                          checked
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-400"
                        }`}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
                {form.unitOptions.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Terpilih: <span className="text-slate-300">{form.unitOptions.join(", ")}</span>
                    {!form.unitOptions.includes(form.unit) && form.unit && (
                      <span className="text-amber-400 ml-1">— Satuan default ({form.unit}) akan ditambahkan otomatis</span>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Pajak Jual Default</Label>
                <Select
                  value={form.defaultSalesTaxId || "__none"}
                  onValueChange={(v) => setF("defaultSalesTaxId", v === "__none" ? "" : v)}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Pilih pajak" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="__none">— Tidak ada —</SelectItem>
                    {taxes.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">Pajak Beli Default</Label>
                <Select
                  value={form.defaultPurchaseTaxId || "__none"}
                  onValueChange={(v) => setF("defaultPurchaseTaxId", v === "__none" ? "" : v)}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Pilih pajak" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="__none">— Tidak ada —</SelectItem>
                    {taxes.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setF("isActive", v)}
                id="item-active"
              />
              <Label htmlFor="item-active" className="text-slate-300 cursor-pointer">
                {form.isActive ? "Aktif" : "Nonaktif"}
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Deskripsi</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setF("description", e.target.value)}
                placeholder="Deskripsi item (opsional)"
                className="bg-slate-800 border-slate-600 text-slate-200 min-h-[70px]"
              />
            </div>

            {/* Gambar / Media */}
            <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
              <Label className="text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                Foto &amp; Video Produk
                <span className="text-xs font-normal text-slate-500 ml-1">(tampil di Website Publik)</span>
              </Label>

              {/* Hidden file inputs */}
              <input ref={imgRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void handleUploadMedia(files, "image");
                  e.target.value = "";
                }}
              />
              <input ref={vidRef} type="file" accept="video/*" className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void handleUploadMedia(files, "video");
                  e.target.value = "";
                }}
              />

              {/* Media grid */}
              {form.mediaItems.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {form.mediaItems.map((m, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-600 bg-slate-900 group">
                      {m.type === "video" ? (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800">
                          <Video className="h-7 w-7 text-slate-400" />
                        </div>
                      ) : (
                        <img
                          src={resolveMediaUrl(m.url)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const updated = form.mediaItems.filter((_, i) => i !== idx);
                          const firstImage = updated.find((x) => x.type === "image");
                          setForm((f) => ({
                            ...f,
                            mediaItems: updated,
                            imageUrl: firstImage ? firstImage.url : (updated.length === 0 ? "" : f.imageUrl),
                          }));
                        }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {idx === 0 && (
                        <span className="absolute bottom-1 left-1 bg-blue-600 text-white text-[9px] px-1 rounded">Cover</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-slate-600 h-24 flex flex-col items-center justify-center text-slate-500 gap-1.5">
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-xs">Belum ada media</span>
                </div>
              )}

              {/* Upload buttons */}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm"
                  className="gap-1.5 flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                  disabled={uploading}
                  onClick={() => imgRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  Tambah Foto
                </Button>
                <Button type="button" variant="outline" size="sm"
                  className="gap-1.5 flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                  disabled={uploading}
                  onClick={() => vidRef.current?.click()}
                >
                  <Video className="h-3.5 w-3.5" />
                  Tambah Video
                </Button>
              </div>
              <p className="text-xs text-slate-500">Foto pertama jadi cover. Format: JPG, PNG, WEBP. Maks. 5MB per file.</p>

              {/* URL alternatif */}
              <details className="group" open={!!form.imageUrl && form.mediaItems.length === 0}>
                <summary className="text-xs cursor-pointer hover:text-slate-300 transition-colors list-none">
                  <span className="text-blue-400 underline-offset-2 hover:underline">atau masukkan URL gambar secara manual</span>
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={form.imageUrl}
                      onChange={(e) => setF("imageUrl", e.target.value)}
                      onBlur={(e) => {
                        const url = e.target.value.trim();
                        if (url) {
                          try { new URL(url); }
                          catch { toast({ title: "URL gambar tidak valid", description: "Masukkan URL lengkap diawali https://", variant: "destructive" }); }
                        }
                      }}
                      placeholder="https://example.com/gambar.jpg"
                      className="bg-slate-900 border-slate-600 text-slate-200 text-sm placeholder:text-slate-500 flex-1"
                    />
                    {form.imageUrl && (
                      <img
                        src={resolveMediaUrl(form.imageUrl)}
                        alt="preview"
                        className="h-9 w-9 rounded object-cover border border-slate-600 shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {form.mediaItems.filter((m) => !m.url.startsWith("/api/storage")).map((item, rawIdx) => {
                      const realIdx = form.mediaItems.indexOf(item);
                      return (
                        <div key={rawIdx} className="flex items-center gap-2">
                          <select
                            value={item.type}
                            onChange={(e) => {
                              const updated = [...form.mediaItems];
                              updated[realIdx] = { ...updated[realIdx], type: e.target.value as "image" | "video" };
                              setF("mediaItems", updated);
                            }}
                            className="bg-slate-900 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1.5 shrink-0"
                          >
                            <option value="image">Gambar</option>
                            <option value="video">Video</option>
                          </select>
                          <Input
                            value={item.url}
                            onChange={(e) => {
                              const updated = [...form.mediaItems];
                              updated[realIdx] = { ...updated[realIdx], url: e.target.value };
                              setF("mediaItems", updated);
                            }}
                            placeholder="https://..."
                            className="bg-slate-900 border-slate-600 text-slate-200 text-sm placeholder:text-slate-500 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => setF("mediaItems", form.mediaItems.filter((_, i) => i !== realIdx))}
                            className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setF("mediaItems", [...form.mediaItems, { type: "image", url: "" }])}
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tambah URL media
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-600 text-slate-300">
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(createMut.isPending || updateMut.isPending) ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Item?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Item <strong className="text-slate-200">{deleteTarget?.name}</strong> akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300 bg-slate-800">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importOpen} onOpenChange={(o) => { if (!importing) setImportOpen(o); }}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              Import Produk dari Excel / CSV
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-400">
                Upload file <span className="text-slate-200 font-medium">.xlsx</span> atau <span className="text-slate-200 font-medium">.csv</span> sesuai format template.
                SKU yang sudah ada akan di-<em>update</em>, SKU baru akan dibuat.
              </p>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 shrink-0" onClick={downloadImportTemplate}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Unduh Template
              </Button>
            </div>

            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-emerald-600 transition-colors"
              onClick={() => importFileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const dt = new DataTransfer(); dt.items.add(f); if (importFileRef.current) { importFileRef.current.files = dt.files; handleImportFileChange({ target: importFileRef.current } as React.ChangeEvent<HTMLInputElement>); } } }}
            >
              <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Klik atau seret file ke sini</p>
              <p className="text-xs text-slate-500 mt-1">Format: .xlsx, .xls, .csv — Maks. 500 baris</p>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleImportFileChange} />
            </div>

            {importError && (
              <div className="flex items-start gap-2 p-3 rounded bg-red-900/30 border border-red-700 text-red-300 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {importError}
              </div>
            )}

            {importRows.length > 0 && !importResults && (
              <div className="space-y-2">
                <p className="text-sm text-slate-300 font-medium">{importRows.length} baris siap diimport — pratinjau:</p>
                <div className="overflow-x-auto rounded border border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-slate-400 font-medium">#</th>
                        {IMPORT_COLS.map((c) => (
                          <th key={c} className="px-2 py-1.5 text-left text-slate-400 font-medium whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-slate-700/60 even:bg-slate-800/30">
                          <td className="px-2 py-1 text-slate-500">{i + 1}</td>
                          {IMPORT_COLS.map((c) => (
                            <td key={c} className="px-2 py-1 text-slate-300 max-w-[120px] truncate" title={row[c]}>{row[c] || <span className="text-slate-600">—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importRows.length > 10 && (
                    <p className="text-xs text-slate-500 px-2 py-1.5 border-t border-slate-700">... dan {importRows.length - 10} baris lainnya</p>
                  )}
                </div>
              </div>
            )}

            {importResults && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-300">Hasil Import:</p>
                <div className="flex gap-3 text-xs mb-2">
                  <span className="text-emerald-400">{importResults.filter((r) => r.status === "created").length} dibuat</span>
                  <span className="text-blue-400">{importResults.filter((r) => r.status === "updated").length} diperbarui</span>
                  <span className="text-red-400">{importResults.filter((r) => r.status === "error").length} gagal</span>
                </div>
                <div className="overflow-x-auto rounded border border-slate-700 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-slate-400">Baris</th>
                        <th className="px-2 py-1.5 text-left text-slate-400">SKU</th>
                        <th className="px-2 py-1.5 text-left text-slate-400">Nama</th>
                        <th className="px-2 py-1.5 text-left text-slate-400">Status</th>
                        <th className="px-2 py-1.5 text-left text-slate-400">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.map((r, i) => (
                        <tr key={i} className="border-t border-slate-700/60 even:bg-slate-800/30">
                          <td className="px-2 py-1 text-slate-400">{r.row}</td>
                          <td className="px-2 py-1 text-slate-300 font-mono">{r.sku ?? "—"}</td>
                          <td className="px-2 py-1 text-slate-300">{r.name ?? "—"}</td>
                          <td className="px-2 py-1">
                            {r.status === "created" && <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Dibuat</span>}
                            {r.status === "updated" && <span className="flex items-center gap-1 text-blue-400"><CheckCircle2 className="h-3 w-3" /> Diperbarui</span>}
                            {r.status === "error" && <span className="flex items-center gap-1 text-red-400"><AlertCircle className="h-3 w-3" /> Gagal</span>}
                          </td>
                          <td className="px-2 py-1 text-slate-400">{r.message ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-700 mt-2">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing} className="border-slate-600 text-slate-300">
              {importResults ? "Tutup" : "Batal"}
            </Button>
            {importRows.length > 0 && !importResults && (
              <Button onClick={handleDoImport} disabled={importing} className="bg-emerald-700 hover:bg-emerald-600">
                {importing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Mengimport...</> : <><Upload className="h-4 w-4 mr-1.5" /> Import {importRows.length} Baris</>}
              </Button>
            )}
            {importResults && (
              <Button variant="outline" onClick={() => { setImportRows([]); setImportResults(null); setImportError(null); }} className="border-slate-600 text-slate-300">
                Import Lagi
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
