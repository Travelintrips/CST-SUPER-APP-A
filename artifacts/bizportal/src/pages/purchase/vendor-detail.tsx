import { useRef, useState } from "react";
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
} from "@workspace/api-client-react";
import type { Supplier, VendorCatalogItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
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
  type: string;
  name: string;
  description: string;
  unit: string;
  priceBase: string;
  markupPct: string;
  isActive: boolean;
  isCommodityTag: boolean;
  sortOrder: string;
};

const emptyCatalogForm = (): CatalogForm => ({
  type: "service",
  name: "",
  description: "",
  unit: "",
  priceBase: "0",
  markupPct: "0",
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
  const { data: products = [] } = useListProducts();
  const vendor = (allVendors ?? []).find((v) => v.id === vendorId) as Supplier | undefined;

  const { data: catalog, isLoading: catalogLoading } = useListVendorCatalog(vendorId, {
    query: { queryKey: getListVendorCatalogQueryKey(vendorId), enabled: !!vendorId },
  });

  const createItem = useCreateVendorCatalogItem();
  const updateItem = useUpdateVendorCatalogItem();
  const deleteItem = useDeleteVendorCatalogItem();
  const updateVendor = useUpdateSupplier();

  const purchaseTaxes = (taxes ?? []).filter((t) => t.kind === "purchase" && t.isActive);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VendorCatalogItem | null>(null);
  const [itemForm, setItemForm] = useState<CatalogForm>(emptyCatalogForm());

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
    setCatalogOpen(true);
  };

  const openEditItem = (item: VendorCatalogItem) => {
    setEditingItem(item);
    setItemForm({
      type: item.type,
      name: item.name,
      description: item.description ?? "",
      unit: item.unit ?? "",
      priceBase: String(item.priceBase),
      markupPct: String(item.markupPct),
      isActive: item.isActive,
      isCommodityTag: (item as any).isCommodityTag ?? false,
      sortOrder: String(item.sortOrder),
    });
    setCatalogOpen(true);
  };

  const submitItem = async () => {
    if (!itemForm.name.trim()) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    const body = {
      type: itemForm.type,
      name: itemForm.name.trim(),
      description: itemForm.description || null,
      unit: itemForm.unit || null,
      priceBase: parseFloat(itemForm.priceBase) || 0,
      markupPct: parseFloat(itemForm.markupPct) || 0,
      isActive: itemForm.isActive,
      isCommodityTag: itemForm.isCommodityTag,
      sortOrder: parseInt(itemForm.sortOrder) || 0,
    };
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
          contactPerson: vendorForm.contactPerson || null,
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Etalase — Produk &amp; Layanan</CardTitle>
              <Button size="sm" onClick={openNewItem}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Item
              </Button>
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
                    <TableHead>Tipe</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Harga Dasar</TableHead>
                    <TableHead className="text-right">Markup (%)</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead className="w-[90px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(catalog ?? []).map((item) => {
                    const base = Number(item.priceBase ?? 0);
                    const markup = Number(item.markupPct ?? 0);
                    const sell = base * (1 + markup / 100);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.unit ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {base > 0 ? fmt(base) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {markup > 0 ? `${markup}%` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-primary">
                          {base > 0 ? fmt(sell) : "-"}
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
                  {(!catalog || catalog.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        Belum ada item. Klik <strong>Tambah Item</strong> untuk mulai mengisi etalase.
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
            <DialogTitle>{editingItem ? "Edit Item" : "Tambah Item Etalase"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Nama Item *</Label>
              <Input
                list="catalog-product-names"
                value={itemForm.name}
                onChange={(e) => {
                  setI("name", e.target.value);
                  const match = products.find((p) => p.name === e.target.value);
                  if (match) {
                    setI("unit", match.unit);
                    if (match.price > 0) setI("priceBase", String(match.price));
                  }
                }}
                placeholder="Ketik atau pilih dari daftar item..."
              />
              <datalist id="catalog-product-names">
                {products.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Pilih dari item yang sudah ada untuk auto-isi satuan & harga, atau ketik nama baru.
              </p>
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
                <Select
                  value={UNITS.includes(itemForm.unit) ? itemForm.unit : (itemForm.unit ? "__custom__" : "__none__")}
                  onValueChange={(v) => {
                    if (v === "__none__") setI("unit", "");
                    else if (v !== "__custom__") setI("unit", v);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih satuan..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Pilih satuan —</SelectItem>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                    {itemForm.unit && !UNITS.includes(itemForm.unit) && (
                      <SelectItem value="__custom__">{itemForm.unit} (kustom)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {(!UNITS.includes(itemForm.unit) && itemForm.unit) && (
                  <Input
                    value={itemForm.unit}
                    onChange={(e) => setI("unit", e.target.value)}
                    placeholder="Satuan kustom..."
                    className="mt-1"
                  />
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Deskripsi</Label>
              <Textarea
                value={itemForm.description}
                onChange={(e) => setI("description", e.target.value)}
                rows={2}
                placeholder="Keterangan tambahan (opsional)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Harga Dasar (Rp)</Label>
                <Input
                  type="number"
                  min="0"
                  value={itemForm.priceBase}
                  onChange={(e) => setI("priceBase", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Markup (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.markupPct}
                  onChange={(e) => setI("markupPct", e.target.value)}
                  placeholder="cth. 20"
                />
              </div>
            </div>
            {(() => {
              const base = parseFloat(itemForm.priceBase) || 0;
              const pct = parseFloat(itemForm.markupPct) || 0;
              if (base <= 0) return null;
              return (
                <p className="text-xs text-muted-foreground -mt-1">
                  Harga jual: <span className="font-semibold text-foreground">{fmt(base * (1 + pct / 100))}</span>
                </p>
              );
            })()}
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
