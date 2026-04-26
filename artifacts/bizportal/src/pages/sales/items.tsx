import { AppShell } from "@/components/layout/AppShell";
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
} from "@workspace/api-client-react";
import { useState, useMemo } from "react";
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
import { Plus, Pencil, Trash2, Search, PackageSearch, Boxes, Package, Wrench, RefreshCw } from "lucide-react";

const LOGISTICS_SUBCATEGORIES = [
  "Udara", "Laut", "Darat", "Pabean", "Handling",
  "Trucking", "Container", "Freight Forwarding", "Lainnya",
];

const UNITS = ["pcs", "kg", "cbm", "container", "shipment", "dokumen", "trip", "ton", "hari"];

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface ItemForm {
  name: string;
  sku: string;
  itemType: "barang" | "jasa";
  categories: string[];
  subcategory: string;
  unit: string;
  price: string;
  defaultSalesTaxId: string;
  defaultPurchaseTaxId: string;
  isActive: boolean;
  description: string;
}

const emptyForm = (): ItemForm => ({
  name: "",
  sku: "",
  itemType: "jasa",
  categories: [],
  subcategory: "",
  unit: "pcs",
  price: "0",
  defaultSalesTaxId: "",
  defaultPurchaseTaxId: "",
  isActive: true,
  description: "",
});

function formFromProduct(p: Product): ItemForm {
  return {
    name: p.name,
    sku: p.sku,
    itemType: p.itemType as "barang" | "jasa",
    categories: p.categories ?? [],
    subcategory: p.subcategory ?? "",
    unit: p.unit,
    price: String(p.price),
    defaultSalesTaxId: p.defaultSalesTaxId ? String(p.defaultSalesTaxId) : "",
    defaultPurchaseTaxId: p.defaultPurchaseTaxId ? String(p.defaultPurchaseTaxId) : "",
    isActive: p.isActive,
    description: p.description ?? "",
  };
}

export default function SalesItemsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

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

  const validate = (): string | null => {
    if (!form.name.trim()) return "Nama item wajib diisi";
    if (!form.sku.trim()) return "SKU/Kode item wajib diisi";
    if (!form.unit) return "Satuan wajib dipilih";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ title: err, variant: "destructive" }); return; }

    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      price: Number(form.price) || 0,
      stock: 0,
      categories: form.categories.length > 0 ? form.categories : (form.subcategory ? [form.subcategory] : []),
      description: form.description || null,
      itemType: form.itemType,
      unit: form.unit,
      subcategory: form.subcategory || null,
      isActive: form.isActive,
      defaultSalesTaxId: form.defaultSalesTaxId ? Number(form.defaultSalesTaxId) : null,
      defaultPurchaseTaxId: form.defaultPurchaseTaxId ? Number(form.defaultPurchaseTaxId) : null,
    };

    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, data: body });
        toast({ title: "Item diperbarui" });
      } else {
        await createMut.mutateAsync({ data: body });
        toast({ title: "Item ditambahkan" });
      }
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      qc.invalidateQueries({ queryKey: getListProductCategoriesQueryKey() });
      setDialogOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e);
      toast({ title: "Gagal menyimpan item", description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id });
      toast({ title: "Item dihapus" });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(e);
      toast({ title: "Gagal menghapus", description: msg, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSeedItems = async () => {
    setSeeding(true);
    try {
      const resp = await fetch("/api/ecommerce/seed-items", { method: "POST" });
      const data = await resp.json();
      toast({ title: `Seed berhasil: ${(data.seeded ?? []).length} item ditambahkan` });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      qc.invalidateQueries({ queryKey: getListProductCategoriesQueryKey() });
    } catch {
      toast({ title: "Seed gagal", variant: "destructive" });
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
                  {LOGISTICS_SUBCATEGORIES.map((s) => (
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
                <PackageSearch className="h-10 w-10 opacity-40" />
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
                          <div className="flex items-center gap-2">
                            {p.itemType === "jasa" ? (
                              <Wrench className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <Package className="h-3.5 w-3.5 text-amber-400 shrink-0" />
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
                        <TableCell className="text-slate-400 text-sm">{p.unit}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-300">
                          {p.price > 0 ? idr(p.price) : <span className="text-slate-500 text-xs">—</span>}
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
                  className="bg-slate-800 border-slate-600 text-slate-200"
                />
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
                <Label className="text-slate-300">Sub-kategori</Label>
                <Select value={form.subcategory || "__none"} onValueChange={(v) => setF("subcategory", v === "__none" ? "" : v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Pilih sub-kategori" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="__none">— Tidak ada —</SelectItem>
                    {LOGISTICS_SUBCATEGORIES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Satuan *</Label>
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
            </div>

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
    </AppShell>
  );
}
