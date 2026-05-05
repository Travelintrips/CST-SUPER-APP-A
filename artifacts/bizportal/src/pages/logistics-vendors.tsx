import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Loader2, Settings, Trash2, Save, ChevronDown, Truck, Filter, X,
} from "lucide-react";

type DeliveryVendor = {
  id: number;
  name: string;
  logo: string;
  eta: string;
  fee: number;
  note: string | null;
  isActive: boolean;
  sortOrder: number;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
};

const SERVICE_TYPE_OPTIONS = [
  "Import", "Export", "Domestic", "Door to Door",
  "Air Freight", "Sea Freight", "Trucking", "Customs Clearance", "Storage", "Handling",
];

function ServiceTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  function toggle(opt: string) {
    const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
    onChange(next.join(", "));
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full min-h-9 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring">
          <span className="flex flex-wrap gap-1 flex-1 text-left">
            {selected.length === 0
              ? <span className="text-muted-foreground">Semua jenis order</span>
              : selected.map((s) => <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">{s}</Badge>)
            }
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="text-xs text-muted-foreground px-2 pb-2">Pilih tipe layanan vendor</p>
        <div className="space-y-1">
          {SERVICE_TYPE_OPTIONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <button type="button" className="mt-2 w-full text-xs text-muted-foreground hover:text-destructive text-center py-1" onClick={() => onChange("")}>
            Hapus semua pilihan
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

const EMPTY_FORM = { name: "", logo: "📦", eta: "2-3 hari", fee: "", note: "", phone: "", email: "", serviceType: "" };

export default function LogisticsVendorsPage() {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<DeliveryVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<DeliveryVendor>>({});
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>("");

  const filtered = filterType
    ? vendors.filter((v) => v.serviceType && v.serviceType.split(",").map((s) => s.trim()).includes(filterType))
    : vendors;

  async function load() {
    try {
      const res = await fetch("/api/logistic/orders/vendors");
      if (!res.ok) throw new Error("Gagal memuat");
      setVendors(await res.json() as DeliveryVendor[]);
    } catch {
      toast({ title: "Gagal memuat data vendor", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!form.name.trim()) {
      toast({ title: "Nama vendor harus diisi", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/logistic/orders/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          logo: form.logo.trim() || "📦",
          eta: form.eta.trim() || "2-3 hari",
          fee: parseFloat(form.fee) || 0,
          note: form.note.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          serviceType: form.serviceType.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      const created = await res.json() as DeliveryVendor;
      setVendors((prev) => [...prev, created]);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      toast({ title: "Vendor berhasil ditambahkan" });
    } catch {
      toast({ title: "Gagal menambahkan vendor", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: number, isActive: boolean) {
    try {
      await fetch(`/api/logistic/orders/vendors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      setVendors((prev) => prev.map((v) => v.id === id ? { ...v, isActive } : v));
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    }
  }

  async function handleSaveEdit(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/logistic/orders/vendors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      const updated = await res.json() as DeliveryVendor;
      setVendors((prev) => prev.map((v) => v.id === id ? updated : v));
      setEditId(null);
      setEditData({});
      toast({ title: "Vendor berhasil diperbarui" });
    } catch {
      toast({ title: "Gagal menyimpan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Hapus vendor "${name}"?`)) return;
    try {
      await fetch(`/api/logistic/orders/vendors/${id}`, { method: "DELETE" });
      setVendors((prev) => prev.filter((v) => v.id !== id));
      toast({ title: "Vendor dihapus" });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" /> Vendor Layanan
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mitra/vendor untuk semua tipe layanan — Import, Export, Customs Clearance, Air/Sea Freight, Trucking, dll. Kontak WA &amp; email digunakan untuk notifikasi order otomatis.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Tambah Vendor
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">
                Daftar Vendor ({filtered.length}{filterType ? ` dari ${vendors.length}` : ""})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1.5">
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setFilterType(filterType === opt ? "" : opt)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        filterType === opt
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-accent"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                  {filterType && (
                    <button type="button" onClick={() => setFilterType("")} className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="h-3 w-3" /> Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 && filterType ? (
              <p className="text-center text-muted-foreground py-12">Tidak ada vendor untuk tipe layanan <strong>{filterType}</strong>.</p>
            ) : vendors.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">Belum ada vendor. Klik "Tambah Vendor" untuk memulai.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((v) => (
                  <div key={v.id} className={`rounded-xl border p-4 transition-all ${v.isActive ? "bg-white border-border" : "bg-gray-50 border-dashed border-gray-200 opacity-60"}`}>
                    {editId === v.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Nama</Label>
                            <Input value={editData.name ?? v.name} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Logo/Emoji</Label>
                            <Input value={editData.logo ?? v.logo} onChange={(e) => setEditData((d) => ({ ...d, logo: e.target.value }))} placeholder="📦" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">ETA</Label>
                            <Input value={editData.eta ?? v.eta} onChange={(e) => setEditData((d) => ({ ...d, eta: e.target.value }))} placeholder="2-3 hari" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ongkir (0 = Nego)</Label>
                            <Input type="number" value={editData.fee ?? v.fee} onChange={(e) => setEditData((d) => ({ ...d, fee: parseFloat(e.target.value) || 0 }))} min="0" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">No. WhatsApp</Label>
                            <Input value={editData.phone ?? v.phone ?? ""} onChange={(e) => setEditData((d) => ({ ...d, phone: e.target.value || null }))} placeholder="628xxxxxxxxxx" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Email</Label>
                            <Input type="email" value={editData.email ?? v.email ?? ""} onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value || null }))} placeholder="vendor@email.com" />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Tipe Layanan</Label>
                            <ServiceTypeSelect
                              value={editData.serviceType ?? v.serviceType ?? ""}
                              onChange={(val) => setEditData((d) => ({ ...d, serviceType: val || null }))}
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Catatan</Label>
                            <Input value={editData.note ?? v.note ?? ""} onChange={(e) => setEditData((d) => ({ ...d, note: e.target.value || null }))} placeholder="Harga nego, dll." />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void handleSaveEdit(v.id)} disabled={saving} className="gap-1.5">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Simpan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setEditData({}); }}>Batal</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <span className="text-2xl shrink-0">{v.logo}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{v.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">⏱ {v.eta}</span>
                            <span className="text-xs font-medium text-primary">
                              {v.fee > 0 ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v.fee) : v.note ?? "Nego"}
                            </span>
                            {v.serviceType && v.serviceType.split(",").map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px] px-1.5">{s.trim()}</Badge>
                            ))}
                            {v.phone && <span className="text-xs text-muted-foreground">📱 {v.phone}</span>}
                            {v.email && <span className="text-xs text-muted-foreground">✉ {v.email}</span>}
                            {!v.isActive && <Badge variant="secondary" className="text-[10px] px-1">Nonaktif</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch checked={v.isActive} onCheckedChange={(checked) => void handleToggle(v.id, checked)} />
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditId(v.id); setEditData({}); }}>
                            <Settings className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => void handleDelete(v.id, v.name)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Vendor Logistik</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nama Vendor *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="PT. Vendor Logistics" />
              </div>
              <div className="space-y-1">
                <Label>Logo/Emoji</Label>
                <Input value={form.logo} onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))} placeholder="📦" />
              </div>
              <div className="space-y-1">
                <Label>ETA</Label>
                <Input value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} placeholder="2-3 hari" />
              </div>
              <div className="space-y-1">
                <Label>No. WhatsApp</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="628xxxxxxxxxx" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="vendor@email.com" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Tipe Layanan</Label>
                <ServiceTypeSelect value={form.serviceType} onChange={(v) => setForm((f) => ({ ...f, serviceType: v }))} />
                <p className="text-[11px] text-muted-foreground">Kosongkan jika vendor menerima semua jenis order.</p>
              </div>
              <div className="space-y-1">
                <Label>Ongkir (Rp, 0 = Nego)</Label>
                <Input type="number" value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))} placeholder="0" min="0" />
              </div>
              <div className="space-y-1">
                <Label>Catatan</Label>
                <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Harga nego, dll." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button onClick={() => void handleAdd()} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
