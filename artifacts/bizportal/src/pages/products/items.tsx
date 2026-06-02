import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Package, FlaskConical, Tag, Settings2, Check, X } from "lucide-react";

const UNITS = ["pcs", "gram", "kg", "ml", "liter", "sachet", "kaleng", "botol", "bungkus", "porsi", "cup", "lusin"];
const NEW_CATEGORY_VALUE = "__new__";

function CategorySelect({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [isNew, setIsNew] = useState(false);
  const [newVal, setNewVal] = useState("");

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["bom-categories"],
    queryFn: () => apiFetch("/bom/categories"),
  });

  const allCategories = categories.includes(value) || value === "" || value === NEW_CATEGORY_VALUE
    ? categories
    : [...categories, value];

  const handleSelect = (v: string) => {
    if (v === NEW_CATEGORY_VALUE) {
      setIsNew(true);
      setNewVal("");
      onChange("");
    } else {
      setIsNew(false);
      onChange(v === "__none__" ? "" : v);
    }
  };

  const selectValue = isNew ? NEW_CATEGORY_VALUE : (value || "__none__");

  return (
    <div className="space-y-1.5">
      <Select value={selectValue} onValueChange={handleSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Pilih kategori..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-gray-400 italic">— Tidak ada kategori —</span>
          </SelectItem>
          {allCategories.map(c => (
            <SelectItem key={c} value={c}>
              <div className="flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-gray-400" />
                {c}
              </div>
            </SelectItem>
          ))}
          <SelectItem value={NEW_CATEGORY_VALUE}>
            <span className="text-blue-600 font-medium">+ Kategori baru...</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {isNew && (
        <Input
          autoFocus
          placeholder="Nama kategori baru"
          value={newVal}
          onChange={e => { setNewVal(e.target.value); onChange(e.target.value); }}
        />
      )}
    </div>
  );
}

interface Product {
  id: number; name: string; sku: string; unit: string;
  price: number; cost_price: number; is_active: boolean;
  item_type: string; subcategory: string | null;
}
interface RawMaterial {
  id: number; name: string; sku: string; unit: string;
  cost_price: number; description: string | null; is_active: boolean;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Error ${res.status}` }));
    throw new Error((err as { message?: string }).message ?? `Error ${res.status}`);
  }
  return res.json();
}

const fmt = (n: number) => Number(n).toLocaleString("id-ID");

// ── Produk Jual Form Dialog ───────────────────────────────────────────────────

function ProductDialog({
  open, onClose, editing, onSaved,
}: { open: boolean; onClose: () => void; editing: Product | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    sku: editing?.sku ?? "",
    unit: editing?.unit ?? "pcs",
    price: editing?.price ? String(editing.price) : "",
    costPrice: editing?.cost_price ? String(editing.cost_price) : "",
    itemType: editing?.item_type ?? "barang",
    subcategory: editing?.subcategory ?? "",
    isActive: editing?.is_active ?? true,
  });

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name, sku: form.sku, unit: form.unit,
        price: Number(form.price), costPrice: Number(form.costPrice),
        itemType: form.itemType, subcategory: form.subcategory || null,
        isActive: form.isActive,
      };
      if (editing) return apiFetch(`/bom/products/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return apiFetch("/bom/products", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast({ title: "Produk disimpan" });
      qc.invalidateQueries({ queryKey: ["bom-categories"] });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit Produk" : "Tambah Produk Jual"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-1">
            <Label>Nama Produk *</Label>
            <Input value={form.name} onChange={f("name")} placeholder="Thai Tea Large" />
          </div>
          <div className="space-y-1">
            <Label>SKU *</Label>
            <Input value={form.sku} onChange={f("sku")} placeholder="TT-LRG-01" />
          </div>
          <div className="space-y-1">
            <Label>Satuan</Label>
            <Select value={form.unit} onValueChange={(v) => setForm(p => ({ ...p, unit: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Harga Jual (Rp)</Label>
            <Input type="number" value={form.price} onChange={f("price")} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label>Harga Pokok (Rp)</Label>
            <Input type="number" value={form.costPrice} onChange={f("costPrice")} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label>Tipe</Label>
            <Select value={form.itemType} onValueChange={(v) => setForm(p => ({ ...p, itemType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="barang">Barang</SelectItem>
                <SelectItem value="jasa">Jasa</SelectItem>
                <SelectItem value="racikan">Racikan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Kategori</Label>
            <CategorySelect
              value={form.subcategory}
              onChange={(v) => setForm(p => ({ ...p, subcategory: v }))}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm(p => ({ ...p, isActive: v }))} id="prod-active" />
            <Label htmlFor="prod-active">Produk aktif</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.sku}>
            {save.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bahan Baku Form Dialog ────────────────────────────────────────────────────

function RawMaterialDialog({
  open, onClose, editing, onSaved,
}: { open: boolean; onClose: () => void; editing: RawMaterial | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    sku: editing?.sku ?? "",
    unit: editing?.unit ?? "gram",
    costPrice: editing?.cost_price ? String(editing.cost_price) : "",
    description: editing?.description ?? "",
    isActive: editing?.is_active ?? true,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name, sku: form.sku, unit: form.unit,
        costPrice: Number(form.costPrice), description: form.description || null,
        isActive: form.isActive,
      };
      if (editing) return apiFetch(`/bom/raw-materials/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return apiFetch("/bom/raw-materials", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => { toast({ title: "Bahan baku disimpan" }); onSaved(); onClose(); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Bahan Baku" : "Tambah Bahan Baku"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-1">
            <Label>Nama Bahan *</Label>
            <Input value={form.name} onChange={f("name")} placeholder="Bubuk Thai Tea" />
          </div>
          <div className="space-y-1">
            <Label>SKU *</Label>
            <Input value={form.sku} onChange={f("sku")} placeholder="RM-THAI-001" />
          </div>
          <div className="space-y-1">
            <Label>Satuan Default</Label>
            <Select value={form.unit} onValueChange={(v) => setForm(p => ({ ...p, unit: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Harga Beli / satuan (Rp)</Label>
            <Input type="number" value={form.costPrice} onChange={f("costPrice")} placeholder="0" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Deskripsi</Label>
            <Input value={form.description} onChange={f("description")} placeholder="Opsional" />
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm(p => ({ ...p, isActive: v }))} id="rm-active" />
            <Label htmlFor="rm-active">Aktif</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.sku}>
            {save.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manajemen Kategori Dialog ─────────────────────────────────────────────────

function CategoryManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const { data: categories = [], isLoading } = useQuery<string[]>({
    queryKey: ["bom-categories"],
    queryFn: () => apiFetch("/bom/categories"),
    enabled: open,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["bom-products"],
    queryFn: () => apiFetch("/bom/products"),
    enabled: open,
  });

  const countByCategory = (cat: string) =>
    products.filter(p => p.subcategory === cat).length;

  const rename = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      apiFetch(`/bom/categories/${encodeURIComponent(oldName)}`, {
        method: "PUT",
        body: JSON.stringify({ newName }),
      }),
    onSuccess: (_, { oldName, newName }) => {
      toast({ title: `Kategori "${oldName}" diubah jadi "${newName}"` });
      qc.invalidateQueries({ queryKey: ["bom-categories"] });
      qc.invalidateQueries({ queryKey: ["bom-products"] });
      setEditingName(null);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/bom/categories/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: (_, name) => {
      toast({ title: `Kategori "${name}" dihapus dari semua produk` });
      qc.invalidateQueries({ queryKey: ["bom-categories"] });
      qc.invalidateQueries({ queryKey: ["bom-products"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const startEdit = (cat: string) => { setEditingName(cat); setEditVal(cat); };
  const cancelEdit = () => { setEditingName(null); setEditVal(""); };
  const commitRename = (oldName: string) => {
    if (!editVal.trim() || editVal.trim() === oldName) { cancelEdit(); return; }
    rename.mutate({ oldName, newName: editVal.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Kelola Kategori Produk
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-1 min-h-[120px]">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Memuat...</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Belum ada kategori. Tambahkan melalui form edit produk.
            </p>
          ) : categories.map(cat => (
            <div key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
              <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0" />

              {editingName === cat ? (
                <Input
                  autoFocus
                  className="h-7 text-sm flex-1"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitRename(cat);
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
              ) : (
                <span className="flex-1 text-sm font-medium">{cat}</span>
              )}

              <span className="text-xs text-gray-400 shrink-0">
                {countByCategory(cat)} produk
              </span>

              {editingName === cat ? (
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700"
                    onClick={() => commitRename(cat)} disabled={rename.isPending}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400"
                    onClick={cancelEdit}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-6 w-6"
                    onClick={() => startEdit(cat)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600"
                    onClick={() => {
                      const n = countByCategory(cat);
                      if (confirm(`Hapus kategori "${cat}"? Kategori ini akan dihapus dari ${n} produk.`))
                        remove.mutate(cat);
                    }}
                    disabled={remove.isPending}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "products" | "raw-materials";

export default function ProductItemsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("products");
  const [search, setSearch] = useState("");
  const [prodDialog, setProdDialog] = useState(false);
  const [editProd, setEditProd] = useState<Product | null>(null);
  const [rmDialog, setRmDialog] = useState(false);
  const [editRm, setEditRm] = useState<RawMaterial | null>(null);
  const [catMgrDialog, setCatMgrDialog] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const { data: products = [], isLoading: prodLoading } = useQuery<Product[]>({
    queryKey: ["bom-products"],
    queryFn: () => apiFetch("/bom/products"),
  });

  const { data: rawMaterials = [], isLoading: rmLoading } = useQuery<RawMaterial[]>({
    queryKey: ["bom-raw-materials"],
    queryFn: () => apiFetch("/bom/raw-materials"),
  });

  const deleteProd = useMutation({
    mutationFn: (id: number) => apiFetch(`/bom/products/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bom-products"] }); toast({ title: "Produk dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteRm = useMutation({
    mutationFn: (id: number) => apiFetch(`/bom/raw-materials/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bom-raw-materials"] }); toast({ title: "Bahan baku dihapus" }); },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const categories = Array.from(new Set(products.map(p => p.subcategory).filter(Boolean) as string[])).sort();

  const filteredProds = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || p.subcategory === filterCat;
    return matchSearch && matchCat;
  });
  const filteredRm = rawMaterials.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Master Produk & Bahan Baku</h1>
            <p className="text-sm text-gray-500 mt-0.5">Kelola produk jual dan bahan baku untuk Recipe/BOM</p>
          </div>
          <div className="flex gap-2">
            {tab === "products" && (
              <Button variant="outline" onClick={() => setCatMgrDialog(true)}>
                <Settings2 className="w-4 h-4 mr-1" /> Kelola Kategori
              </Button>
            )}
            {tab === "products" ? (
              <Button onClick={() => { setEditProd(null); setProdDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Tambah Produk
              </Button>
            ) : (
              <Button onClick={() => { setEditRm(null); setRmDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Tambah Bahan Baku
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {([
            { key: "products", label: "Produk Jual", icon: Package, count: products.length },
            { key: "raw-materials", label: "Bahan Baku", icon: FlaskConical, count: rawMaterials.length },
          ] as Array<{ key: Tab; label: string; icon: typeof Package; count: number }>).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSearch(""); setFilterCat(null); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab === key ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + Category Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder={tab === "products" ? "Cari produk..." : "Cari bahan baku..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {tab === "products" && categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-400">Filter:</span>
              <button
                onClick={() => setFilterCat(null)}
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterCat === null
                    ? "bg-gray-800 text-white border-gray-800"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                Semua
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCat(filterCat === cat ? null : cat)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterCat === cat
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600"
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  {cat}
                  <span className={`ml-0.5 ${filterCat === cat ? "text-orange-100" : "text-gray-400"}`}>
                    ({products.filter(p => p.subcategory === cat).length})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table — Produk Jual */}
        {tab === "products" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Produk</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-right">HPP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prodLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">Memuat...</TableCell></TableRow>
                  ) : filteredProds.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-10 text-gray-400">Belum ada produk</TableCell></TableRow>
                  ) : filteredProds.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-gray-500 text-sm font-mono">{p.sku}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{p.item_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.subcategory
                          ? (
                            <button
                              onClick={() => setFilterCat(filterCat === p.subcategory ? null : p.subcategory)}
                              title={filterCat === p.subcategory ? "Hapus filter" : `Filter: ${p.subcategory}`}
                            >
                              <Badge
                                variant="secondary"
                                className={`text-xs font-normal cursor-pointer transition-colors ${
                                  filterCat === p.subcategory
                                    ? "bg-orange-500 text-white hover:bg-orange-600"
                                    : "hover:bg-orange-100 hover:text-orange-700"
                                }`}
                              >
                                <Tag className="w-3 h-3 mr-1 inline" />{p.subcategory}
                              </Badge>
                            </button>
                          )
                          : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{p.unit}</TableCell>
                      <TableCell className="text-right text-sm">Rp {fmt(p.price)}</TableCell>
                      <TableCell className="text-right text-sm text-gray-500">Rp {fmt(p.cost_price)}</TableCell>
                      <TableCell>
                        <Badge className={p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                          {p.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditProd(p); setProdDialog(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => { if (confirm(`Hapus produk "${p.name}"?`)) deleteProd.mutate(p.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Table — Bahan Baku */}
        {tab === "raw-materials" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Bahan</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Harga Beli / Satuan</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rmLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">Memuat...</TableCell></TableRow>
                  ) : filteredRm.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">
                      {rawMaterials.length === 0 ? "Belum ada bahan baku. Klik \"Tambah Bahan Baku\" untuk mulai." : "Tidak ada hasil"}
                    </TableCell></TableRow>
                  ) : filteredRm.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-gray-500 text-sm font-mono">{m.sku}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-right text-sm">Rp {fmt(m.cost_price)}</TableCell>
                      <TableCell className="text-sm text-gray-500">{m.description ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={m.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                          {m.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { setEditRm(m); setRmDialog(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => { if (confirm(`Hapus "${m.name}"?`)) deleteRm.mutate(m.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Dialogs */}
        {prodDialog && (
          <ProductDialog
            open={prodDialog}
            onClose={() => setProdDialog(false)}
            editing={editProd}
            onSaved={() => qc.invalidateQueries({ queryKey: ["bom-products"] })}
          />
        )}
        {rmDialog && (
          <RawMaterialDialog
            open={rmDialog}
            onClose={() => setRmDialog(false)}
            editing={editRm}
            onSaved={() => qc.invalidateQueries({ queryKey: ["bom-raw-materials"] })}
          />
        )}
        {catMgrDialog && (
          <CategoryManagerDialog
            open={catMgrDialog}
            onClose={() => setCatMgrDialog(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
