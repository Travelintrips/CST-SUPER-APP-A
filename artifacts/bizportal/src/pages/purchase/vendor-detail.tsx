import { useRef, useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useListSuppliers,
  useUpdateSupplier,
  useListVendorCatalog,
  useCreateVendorCatalogItem,
  useUpdateVendorCatalogItem,
  useDeleteVendorCatalogItem,
  getListVendorCatalogQueryKey,
  getListSuppliersQueryKey,
  useListTaxes,
  useListProducts,
  useListProductCategories,
} from "@workspace/api-client-react";
import type { Supplier, VendorCatalogItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";

const SERVICE_TYPES = [
  "Import", "Export", "Domestic", "Door to Door",
  "Air Freight", "Sea Freight", "Domestic Freight",
  "Import Customs", "Export Customs", "Trucking", "Handling",
];

const UNITS = ["pcs", "kg", "ton", "cbm", "container", "shipment", "dokumen", "trip", "hari", "unit", "lembar"];

const ETA_OPTIONS = [
  "1-2 hari", "2-3 hari", "3-5 hari", "5-7 hari",
  "1-2 minggu", "2-4 minggu", "1 bulan+",
];

function getLogoServeUrl(path: string) {
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  return path;
}

function isImageUrl(val: string) {
  return val.startsWith("http") || val.startsWith("/api/") || val.startsWith("/objects/");
}

function LogoDisplay({ logo, size = "sm" }: { logo: string | null | undefined; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "h-8 w-8 object-contain rounded" : "h-6 w-6 object-contain rounded";
  const textCls = size === "lg" ? "text-2xl" : "text-base";
  if (!logo) return <span className="text-muted-foreground text-xs">—</span>;
  if (isImageUrl(logo)) {
    return <img src={getLogoServeUrl(logo)} alt="logo" className={cls} />;
  }
  return <span className={textCls}>{logo}</span>;
}

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;


type CatalogForm = {
  masterItemId: number | null;
  type: string;
  name: string;
  description: string;
  unit: string;
  kategori: string;
  subcategory: string;
  priceBase: string;
  isActive: boolean;
  isCommodityTag: boolean;
  sortOrder: string;
};

const emptyCatalogForm = (): CatalogForm => ({
  masterItemId: null,
  type: "service",
  name: "",
  description: "",
  unit: "",
  kategori: "",
  subcategory: "",
  priceBase: "0",
  isActive: true,
  isCommodityTag: false,
  sortOrder: "0",
});

type VendorForm = {
  name: string;
  country: string;
  contactEmail: string;
  contactPerson: string;
  phone: string;
  address: string;
  taxId: string;
  defaultPurchaseTaxId: number | null;
  serviceType: string;
  isActive: boolean;
  logo: string;
  eta: string;
  note: string;
  sortOrder: string;
};

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const vendorId = Number(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();

  const { data: allVendors } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const { data: taxes } = useListTaxes();
  const { data: _productsPaginated } = useListProducts({ limit: 500 });
  const products = _productsPaginated?.data ?? [];
  const { data: productCategories = [] } = useListProductCategories();
  const vendor = (allVendors ?? []).find((v) => v.id === vendorId) as Supplier | undefined;

  const { data: catalog, isLoading: catalogLoading } = useListVendorCatalog(vendorId, {
    query: { queryKey: getListVendorCatalogQueryKey(vendorId), enabled: !!vendorId },
  });

  const createItem = useCreateVendorCatalogItem();
  const updateItem = useUpdateVendorCatalogItem();
  const deleteItem = useDeleteVendorCatalogItem();
  const updateVendor = useUpdateSupplier();

  const purchaseTaxes = (taxes ?? []).filter((t) => t.kind === "purchase" && t.isActive);

  const allSubcategories = Array.from(new Set(
    (catalog ?? []).map((i) => (i as any).subcategory).filter((s): s is string => !!s)
  )).sort();

  const allKategoriCatalog = Array.from(new Set(
    (catalog ?? []).map((i) => (i as any).kategori).filter((s): s is string => !!s)
  )).sort();

  const [catalogSearch, setCatalogSearch] = useState("");
  const [filterKategoriCatalog, setFilterKategoriCatalog] = useState("all");
  const [filterSubcatCatalog, setFilterSubcatCatalog] = useState("all");

  const filteredCatalog = useMemo(() => {
    return (catalog ?? []).filter((item) => {
      if (filterKategoriCatalog !== "all" && (item as any).kategori !== filterKategoriCatalog) return false;
      if (filterSubcatCatalog !== "all" && (item as any).subcategory !== filterSubcatCatalog) return false;
      if (catalogSearch) {
        const q = catalogSearch.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q) ||
          ((item as any).kategori ?? "").toLowerCase().includes(q) ||
          ((item as any).subcategory ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalog, filterKategoriCatalog, filterSubcatCatalog, catalogSearch]);

  const catalogSummary = useMemo(() => {
    const all = catalog ?? [];
    const activeItems = all.filter((i) => i.isActive);
    const inactiveItems = all.filter((i) => !i.isActive);
    const linkedItems = all.filter((i) => (i as any).masterItemId != null);
    const withSell = all.filter((i) => (i as any).priceSell != null);

    const totalPriceBase = activeItems.reduce((sum, i) => sum + Number(i.priceBase ?? 0), 0);

    const avgMarginPct = withSell.length > 0
      ? withSell.reduce((sum, i) => {
          const sell = Number((i as any).priceSell ?? 0);
          const base = Number(i.priceBase ?? 0);
          return sum + (sell > 0 ? ((sell - base) / sell) * 100 : 0);
        }, 0) / withSell.length
      : null;

    return {
      totalPriceBase,
      avgMarginPct,
      activeCount: activeItems.length,
      inactiveCount: inactiveItems.length,
      linkedCount: linkedItems.length,
      totalCount: all.length,
    };
  }, [catalog]);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VendorCatalogItem | null>(null);
  const [itemForm, setItemForm] = useState<CatalogForm>(emptyCatalogForm());
  const [masterItemSearch, setMasterItemSearch] = useState("");

  const [vendorEditOpen, setVendorEditOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState<VendorForm | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile } = useUpload({
    onError: (err) => {
      toast({ title: t.common.error, variant: "destructive" });
      setLogoUploading(false);
    },
  });

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const result = await uploadFile(file);
      if (result?.objectPath) {
        setV("logo", result.objectPath);
        toast({ title: t.common.success });
      }
    } finally {
      setLogoUploading(false);
    }
  };

  const toggleServiceType = (type: string) => {
    if (!vendorForm) return;
    const current = vendorForm.serviceType
      ? vendorForm.serviceType.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const idx = current.findIndex((s) => s.toLowerCase() === type.toLowerCase());
    if (idx >= 0) current.splice(idx, 1);
    else current.push(type);
    setV("serviceType", current.join(", "));
  };

  const setI = (k: keyof CatalogForm, v: CatalogForm[keyof CatalogForm]) =>
    setItemForm((f) => ({ ...f, [k]: v }));

  const openNewItem = () => {
    setEditingItem(null);
    setItemForm(emptyCatalogForm());
    setMasterItemSearch("");
    setCatalogOpen(true);
  };

  const openEditItem = (item: VendorCatalogItem) => {
    setEditingItem(item);
    setItemForm({
      masterItemId: (item as any).masterItemId ?? null,
      type: item.type,
      name: item.name,
      description: item.description ?? "",
      unit: item.unit ?? "",
      kategori: (item as any).kategori ?? "",
      subcategory: (item as any).subcategory ?? "",
      priceBase: String(Number(item.priceBase ?? 0)),
      isActive: item.isActive,
      isCommodityTag: (item as any).isCommodityTag ?? false,
      sortOrder: String(item.sortOrder),
    });
    setMasterItemSearch("");
    setCatalogOpen(true);
  };

  const submitItem = async () => {
    if (!editingItem && !itemForm.masterItemId) {
      toast({ title: "Pilih item dari Master Item terlebih dahulu", variant: "destructive" });
      return;
    }
    // Item lama (legacy) tanpa masterItemId wajib punya nama
    if (editingItem && !(editingItem as any).masterItemId && !itemForm.name.trim()) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    const body: Record<string, unknown> = {
      priceBase: parseFloat(itemForm.priceBase) || 0,
      isActive: itemForm.isActive,
      isCommodityTag: itemForm.isCommodityTag,
      sortOrder: parseInt(itemForm.sortOrder) || 0,
    };
    // Tambah masterItemId hanya saat create baru
    if (!editingItem) {
      body.masterItemId = itemForm.masterItemId;
    }
    // Legacy item: sertakan field manual
    if (editingItem && !(editingItem as any).masterItemId) {
      body.type = itemForm.type;
      body.name = itemForm.name.trim();
      body.description = itemForm.description || null;
      body.unit = itemForm.unit || null;
      body.kategori = itemForm.kategori || null;
      body.subcategory = itemForm.subcategory || null;
    }
    try {
      if (editingItem) {
        const updated = await updateItem.mutateAsync({ itemId: editingItem.id, data: body });
        qc.setQueryData<VendorCatalogItem[]>(getListVendorCatalogQueryKey(vendorId), (old) =>
          old ? old.map((i) => (i.id === updated.id ? updated : i)) : [updated]
        );
        toast({ title: t.common.success });
      } else {
        const created = await createItem.mutateAsync({ id: vendorId, data: body });
        qc.setQueryData<VendorCatalogItem[]>(getListVendorCatalogQueryKey(vendorId), (old) =>
          old ? [...old, created] : [created]
        );
        toast({ title: t.common.success });
      }
      setCatalogOpen(false);
      setEditingItem(null);
    } catch (e) {
      toast({ title: t.common.error, description: String(e), variant: "destructive" });
    }
  };

  const removeItem = async (itemId: number) => {
    if (!confirm("Hapus item ini?")) return;
    try {
      await deleteItem.mutateAsync({ itemId });
      qc.setQueryData<VendorCatalogItem[]>(getListVendorCatalogQueryKey(vendorId), (old) =>
        old ? old.filter((i) => i.id !== itemId) : []
      );
      toast({ title: t.common.success });
    } catch (e) {
      toast({ title: t.common.error, description: String(e), variant: "destructive" });
    }
  };

  const openVendorEdit = () => {
    if (!vendor) return;
    setVendorForm({
      name: vendor.name,
      country: vendor.country ?? "",
      contactEmail: vendor.contactEmail ?? "",
      contactPerson: (vendor as { contactPerson?: string | null }).contactPerson ?? "",
      phone: vendor.phone ?? "",
      address: vendor.address ?? "",
      taxId: vendor.taxId ?? "",
      defaultPurchaseTaxId: vendor.defaultPurchaseTaxId ?? null,
      serviceType: vendor.serviceType ?? "",
      isActive: vendor.isActive ?? true,
      logo: vendor.logo ?? "📦",
      eta: vendor.eta ?? "",
      note: vendor.note ?? "",
      sortOrder: String(vendor.sortOrder ?? 0),
    });
    setVendorEditOpen(true);
  };

  const submitVendor = async () => {
    if (!vendorForm || !vendor) return;
    if (!vendorForm.name.trim()) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    try {
      const updated = await updateVendor.mutateAsync({
        id: vendor.id,
        data: {
          name: vendorForm.name.trim(),
          country: vendorForm.country || null,
          contactEmail: vendorForm.contactEmail || null,
          phone: vendorForm.phone || null,
          address: vendorForm.address || null,
          taxId: vendorForm.taxId || null,
          defaultPurchaseTaxId: vendorForm.defaultPurchaseTaxId,
          serviceType: vendorForm.serviceType || null,
          isActive: vendorForm.isActive,
          logo: vendorForm.logo || "📦",
          eta: vendorForm.eta || null,
          note: vendorForm.note || null,
          sortOrder: parseInt(vendorForm.sortOrder) || 0,
        },
      });
      qc.setQueryData<Supplier[]>(getListSuppliersQueryKey(), (old) =>
        old ? old.map((s) => (s.id === updated.id ? updated : s)) : [updated]
      );
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      toast({ title: t.common.success });
      setVendorEditOpen(false);
    } catch (e) {
      toast({ title: t.common.error, description: String(e), variant: "destructive" });
    }
  };

  const setV = (k: keyof VendorForm, v: VendorForm[keyof VendorForm]) =>
    setVendorForm((f) => (f ? { ...f, [k]: v } : f));

  if (!vendor) {
    return (
      <AppShell>
        <div className="flex flex-col gap-4">
          <Link href="/purchase/vendors">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Kembali</Button>
          </Link>
          <p className="text-muted-foreground">Vendor tidak ditemukan.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link href="/purchase/vendors">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Vendors</Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LogoDisplay logo={vendor.logo} size="lg" />
              <span>{vendor.name}</span>
              {vendor.isActive
                ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs ml-1">Aktif</Badge>
                : <Badge variant="outline" className="text-xs text-muted-foreground ml-1">Nonaktif</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {vendor.serviceType ?? "Semua Layanan"}
              {vendor.country ? ` · ${vendor.country}` : ""}
              {vendor.eta ? ` · ETA: ${vendor.eta}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openVendorEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Edit Vendor
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "PIC", value: (vendor as { contactPerson?: string | null }).contactPerson ?? "-" },
            { label: "Telepon", value: vendor.phone ?? "-" },
            { label: "Email", value: vendor.contactEmail ?? "-" },
            { label: "NPWP", value: vendor.taxId ?? "-" },
            { label: "Alamat", value: vendor.address ?? "-" },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium mt-0.5 truncate" title={value}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {vendor.note && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Catatan</p>
              <p className="text-sm">{vendor.note}</p>
            </CardContent>
          </Card>
        )}

        {/* ── Summary Cards ── */}
        {!catalogLoading && (catalog ?? []).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Item</p>
                <p className="text-2xl font-bold mt-0.5">{catalogSummary.totalCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="text-green-600 font-medium">{catalogSummary.activeCount} aktif</span>
                  {catalogSummary.inactiveCount > 0 && <> · {catalogSummary.inactiveCount} nonaktif</>}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Harga Dasar (Aktif)</p>
                <p className="text-lg font-bold mt-0.5 font-mono">
                  {catalogSummary.totalPriceBase > 0 ? fmt(catalogSummary.totalPriceBase) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Sum priceBase item aktif</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Rata-rata Margin</p>
                <p className="text-2xl font-bold mt-0.5">
                  {catalogSummary.avgMarginPct != null
                    ? <span className={catalogSummary.avgMarginPct >= 0 ? "text-green-600" : "text-destructive"}>{catalogSummary.avgMarginPct.toFixed(1)}%</span>
                    : <span className="text-muted-foreground text-base">—</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Dari item terhubung master</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Link Master Item</p>
                <p className="text-2xl font-bold mt-0.5">{catalogSummary.linkedCount}<span className="text-base font-normal text-muted-foreground">/{catalogSummary.totalCount}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {catalogSummary.linkedCount < catalogSummary.totalCount
                    ? <span className="text-amber-600">{catalogSummary.totalCount - catalogSummary.linkedCount} item belum terhubung</span>
                    : <span className="text-green-600">Semua terhubung</span>}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Etalase — Produk &amp; Layanan</CardTitle>
              <Button size="sm" onClick={openNewItem}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Item
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Cari nama, deskripsi..."
                  className="pl-8 h-8 text-sm"
                />
                {catalogSearch && (
                  <button onClick={() => setCatalogSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select value={filterKategoriCatalog} onValueChange={setFilterKategoriCatalog}>
                <SelectTrigger className="h-8 text-sm w-[150px]">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {allKategoriCatalog.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSubcatCatalog} onValueChange={setFilterSubcatCatalog}>
                <SelectTrigger className="h-8 text-sm w-[160px]">
                  <SelectValue placeholder="Sub-kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Sub-kategori</SelectItem>
                  {allSubcategories.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(catalogSearch || filterKategoriCatalog !== "all" || filterSubcatCatalog !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => { setCatalogSearch(""); setFilterKategoriCatalog("all"); setFilterSubcatCatalog("all"); }}
                >
                  <X className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {catalogLoading ? (
              <p className="text-center text-muted-foreground py-8 text-sm">Memuat...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Harga Dasar</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead className="w-[90px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCatalog.map((item) => {
                    const priceBase = Number(item.priceBase ?? 0);
                    const priceSell = (item as any).priceSell as number | null;
                    const profit = (item as any).profit as number | null;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(item as any).kategori
                            ? <span className="flex items-center gap-1 text-muted-foreground"><Tag className="h-3 w-3" />{(item as any).kategori}</span>
                            : <span className="text-muted-foreground">—</span>}
                          {(item as any).subcategory && (
                            <p className="text-xs text-muted-foreground mt-0.5">{(item as any).subcategory}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.unit ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {priceBase > 0 ? fmt(priceBase) : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-primary">
                          {priceSell != null
                            ? fmt(priceSell)
                            : <span className="text-xs text-amber-500 font-normal">Belum linked</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {profit != null
                            ? <span className={profit >= 0 ? "text-green-600" : "text-destructive"}>{fmt(profit)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell>
                          {item.isActive
                            ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Aktif</Badge>
                            : <Badge variant="outline" className="text-xs text-muted-foreground">Nonaktif</Badge>}
                        </TableCell>
                        <TableCell>
                          {(item as any).isCommodityTag && (
                            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-xs">🏷️ Komoditi</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => openEditItem(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredCatalog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                        {(catalogSearch || filterKategoriCatalog !== "all" || filterSubcatCatalog !== "all")
                          ? "Tidak ada item yang cocok dengan filter."
                          : <>Belum ada item. Klik <strong>Tambah Item</strong> untuk mulai mengisi etalase.</>}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={catalogOpen} onOpenChange={(v) => { setCatalogOpen(v); if (!v) setEditingItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item Etalase" : "Tambah Item ke Etalase"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">

            {/* ── Pilih Master Item (hanya saat tambah baru) ── */}
            {!editingItem && (
              <div className="grid gap-1.5">
                <Label>Master Item *</Label>
                {itemForm.masterItemId ? (
                  // Item sudah dipilih — tampilkan info + tombol ganti
                  (() => {
                    const sel = products.find((p) => p.id === itemForm.masterItemId);
                    return (
                      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{sel?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {sel?.itemType === "jasa" ? "Layanan" : "Produk"} · {sel?.unit ?? "-"}
                            {(sel?.categories as string[] | undefined)?.[0] && (
                              <> · <Tag className="inline h-3 w-3" /> {(sel.categories as string[])[0]}</>
                            )}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="shrink-0 h-7 px-2 text-xs"
                          onClick={() => { setI("masterItemId", null); setMasterItemSearch(""); }}>
                          <X className="h-3 w-3 mr-1" /> Ganti
                        </Button>
                      </div>
                    );
                  })()
                ) : (
                  // Picker — search + scrollable list
                  <div className="grid gap-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={masterItemSearch}
                        onChange={(e) => setMasterItemSearch(e.target.value)}
                        placeholder="Cari nama item..."
                        className="pl-8 h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="border rounded-md overflow-y-auto max-h-44">
                      {(() => {
                        const q = masterItemSearch.toLowerCase();
                        const linkedIds = new Set((catalog ?? []).map((i) => (i as any).masterItemId).filter(Boolean));
                        const filtered = products.filter((p) =>
                          !linkedIds.has(p.id) &&
                          (p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
                        );
                        if (filtered.length === 0) {
                          return (
                            <p className="text-center text-xs text-muted-foreground py-4">
                              {q ? "Tidak ada item yang cocok." : "Semua item sudah ditambahkan ke etalase ini."}
                            </p>
                          );
                        }
                        return filtered.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                            onClick={() => {
                              setI("masterItemId", p.id);
                            }}
                          >
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.itemType === "jasa" ? "Layanan" : "Produk"} · {p.unit}
                              {(p.categories as string[] | undefined)?.[0] && <> · {(p.categories as string[])[0]}</>}
                            </p>
                          </button>
                        ));
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground">Produk dan layanan diambil dari <strong>Katalog &gt; Master Item</strong>.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Edit mode: tampilkan nama master item sebagai read-only ── */}
            {editingItem && (editingItem as any).masterItemId && (
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground mb-0.5">Item dari Master Item</p>
                <p className="font-medium text-sm">{editingItem.name}</p>
                <p className="text-xs text-muted-foreground">
                  {editingItem.type === "service" ? "Layanan" : "Produk"} · {editingItem.unit ?? "-"}
                  {(editingItem as any).kategori && <> · <Tag className="inline h-3 w-3" /> {(editingItem as any).kategori}</>}
                </p>
              </div>
            )}

            {/* ── Legacy item: tetap bisa edit semua field ── */}
            {editingItem && !(editingItem as any).masterItemId && (
              <>
                <div className="grid gap-1.5">
                  <Label>Nama Item *</Label>
                  <Input value={itemForm.name} onChange={(e) => setI("name", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Tipe</Label>
                    <Select value={itemForm.type} onValueChange={(v) => setI("type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="service">Layanan</SelectItem>
                        <SelectItem value="product">Produk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Satuan</Label>
                    <Input value={itemForm.unit} onChange={(e) => setI("unit", e.target.value)} placeholder="pcs, kg, dll" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Deskripsi</Label>
                  <Textarea value={itemForm.description} onChange={(e) => setI("description", e.target.value)} rows={2} />
                </div>
              </>
            )}

            {/* ── Harga Dasar — editable untuk semua item ── */}
            <div className="grid gap-1.5">
              <Label>Harga Dasar (Rp)</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={itemForm.priceBase}
                onChange={(e) => setI("priceBase", e.target.value)}
                placeholder="Harga yang vendor charge ke kita"
              />
              <p className="text-xs text-muted-foreground">
                Harga beli / biaya vendor. Dipakai untuk RFQ blast. Profit = Harga Jual (master) − Harga Dasar.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Urutan Tampil</Label>
                <Input
                  type="number"
                  min="0"
                  value={itemForm.sortOrder}
                  onChange={(e) => setI("sortOrder", e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch
                  id="item-active"
                  checked={itemForm.isActive}
                  onCheckedChange={(v) => setI("isActive", v)}
                />
                <Label htmlFor="item-active" className="cursor-pointer">Aktif</Label>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
              <Switch
                id="item-commodity"
                checked={itemForm.isCommodityTag}
                onCheckedChange={(v) => setI("isCommodityTag", v)}
              />
              <div>
                <Label htmlFor="item-commodity" className="cursor-pointer text-orange-800 font-medium">🏷️ Komoditi yang Ditangani</Label>
                <p className="text-xs text-orange-600 mt-0.5">Aktifkan agar item ini diprioritaskan saat auto-match blast vendor.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatalogOpen(false)}>Batal</Button>
            <Button onClick={submitItem} disabled={createItem.isPending || updateItem.isPending}>
              {editingItem ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorEditOpen} onOpenChange={setVendorEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          {vendorForm && (
            <Tabs defaultValue="bisnis">
              <TabsList className="w-full">
                <TabsTrigger value="bisnis" className="flex-1">Informasi Bisnis</TabsTrigger>
                <TabsTrigger value="layanan" className="flex-1">Layanan</TabsTrigger>
              </TabsList>
              <TabsContent value="bisnis" className="mt-3 grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Nama *</Label>
                  <Input value={vendorForm.name} onChange={(e) => setV("name", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Negara</Label>
                    <Input value={vendorForm.country} onChange={(e) => setV("country", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Telepon</Label>
                    <Input value={vendorForm.phone} onChange={(e) => setV("phone", e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>PIC / Contact Person</Label>
                  <Input value={vendorForm.contactPerson} onChange={(e) => setV("contactPerson", e.target.value)} placeholder="Nama penghubung" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Email Kontak</Label>
                  <Input type="email" value={vendorForm.contactEmail} onChange={(e) => setV("contactEmail", e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>NPWP</Label>
                  <Input value={vendorForm.taxId} onChange={(e) => setV("taxId", e.target.value)} placeholder="cth. 01.234.567.8-901.000" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Alamat</Label>
                  <Textarea value={vendorForm.address} onChange={(e) => setV("address", e.target.value)} rows={2} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Tarif Pajak Default (PPN Pembelian)</Label>
                  <Select
                    value={vendorForm.defaultPurchaseTaxId ? String(vendorForm.defaultPurchaseTaxId) : "none"}
                    onValueChange={(v) => setV("defaultPurchaseTaxId", v === "none" ? null : parseInt(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="Gunakan default global" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Gunakan default global —</SelectItem>
                      {purchaseTaxes.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              <TabsContent value="layanan" className="mt-3 grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Tipe Layanan</Label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_TYPES.map((type) => {
                      const selectedTypes = vendorForm.serviceType
                        ? vendorForm.serviceType.split(",").map((s) => s.trim()).filter(Boolean)
                        : [];
                      const active = selectedTypes.some(
                        (s) => s.toLowerCase() === type.toLowerCase()
                      );
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleServiceType(type)}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-foreground"
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                  {(!vendorForm.serviceType || vendorForm.serviceType.trim() === "") && (
                    <p className="text-xs text-muted-foreground">Kosong = semua jenis layanan.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Ikon / Logo</Label>
                    <div className="flex items-center gap-2">
                      {vendorForm.logo && (
                        <div className="h-9 w-9 rounded border flex items-center justify-center bg-muted shrink-0">
                          <LogoDisplay logo={vendorForm.logo} />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={logoUploading}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        {logoUploading ? "Mengunggah..." : "Upload Gambar"}
                      </Button>
                      {vendorForm.logo && vendorForm.logo !== "📦" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setV("logo", "📦")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Estimasi (ETA)</Label>
                    <Select
                      value={vendorForm.eta || "__none__"}
                      onValueChange={(v) => setV("eta", v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih estimasi..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Tidak ditentukan —</SelectItem>
                        {ETA_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Urutan Tampil</Label>
                    <Input type="number" min="0" value={vendorForm.sortOrder} onChange={(e) => setV("sortOrder", e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Catatan</Label>
                  <Textarea value={vendorForm.note} onChange={(e) => setV("note", e.target.value)} rows={2} />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Switch id="vendor-active" checked={vendorForm.isActive} onCheckedChange={(v) => setV("isActive", v)} />
                  <Label htmlFor="vendor-active">Aktif (tampil di portal &amp; notifikasi)</Label>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorEditOpen(false)}>Batal</Button>
            <Button onClick={submitVendor} disabled={updateVendor.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
