import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Package, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface Service {
  id: number;
  name: string;
  category: string;
  description: string | null;
  price_per_hour: number;
  capacity: number;
  unit: string;
  is_active: boolean;
  sort_order: number;
}

const CATEGORIES = ["Futsal", "Badminton", "Basket", "Gym", "Yoga", "Aerobik", "Lainnya"];

const EMPTY: Omit<Service, "id"> = {
  name: "", category: "Lainnya", description: "", price_per_hour: 0,
  capacity: 10, unit: "sesi", is_active: true, sort_order: 0,
};

const CAT_COLOR: Record<string, string> = {
  Futsal:   "bg-blue-500/20 text-blue-300",
  Badminton:"bg-emerald-500/20 text-emerald-300",
  Basket:   "bg-orange-500/20 text-orange-300",
  Gym:      "bg-violet-500/20 text-violet-300",
  Yoga:     "bg-pink-500/20 text-pink-300",
  Aerobik:  "bg-red-500/20 text-red-300",
  Lainnya:  "bg-white/10 text-white/60",
};

export default function SportCenterServicesPage() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<Omit<Service, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sport-center/admin/services");
      setServices(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }

  function openEdit(s: Service) {
    setEditing(s);
    setForm({ name: s.name, category: s.category, description: s.description ?? "", price_per_hour: s.price_per_hour, capacity: s.capacity, unit: s.unit, is_active: s.is_active, sort_order: s.sort_order });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast({ title: "Nama wajib diisi", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = { name: form.name, category: form.category, description: form.description, pricePerHour: form.price_per_hour, capacity: form.capacity, unit: form.unit, isActive: form.is_active, sortOrder: form.sort_order };
      const url = editing ? `/api/sport-center/admin/services/${editing.id}` : "/api/sport-center/admin/services";
      const r = await fetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editing ? "Layanan diperbarui" : "Layanan ditambahkan" });
      setOpen(false);
      fetchServices();
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Service) {
    try {
      await fetch(`/api/sport-center/admin/services/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, category: s.category, description: s.description, pricePerHour: s.price_per_hour, capacity: s.capacity, unit: s.unit, isActive: !s.is_active, sortOrder: s.sort_order }),
      });
      setServices((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: !x.is_active } : x));
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    }
  }

  async function deleteService(id: number, name: string) {
    if (!confirm(`Hapus layanan "${name}"?`)) return;
    try {
      await fetch(`/api/sport-center/admin/services/${id}`, { method: "DELETE" });
      setServices((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "Layanan dihapus" });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  }

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Produk & Layanan</h1>
            <p className="text-sm text-white/60 mt-0.5">Kelola fasilitas dan layanan Sport Center</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Tambah Layanan
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-44 rounded-xl bg-white/10 animate-pulse" />)}
          </div>
        ) : services.length === 0 ? (
          <div className="py-20 text-center text-white/40">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada layanan</p>
            <Button onClick={openNew} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Tambah pertama
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((s) => (
              <Card key={s.id} className={`border-0 shadow-sm transition-opacity ${s.is_active ? "" : "opacity-50"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate">{s.name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CAT_COLOR[s.category] ?? CAT_COLOR.Lainnya}`}>
                        {s.category}
                      </span>
                    </div>
                    <button onClick={() => toggleActive(s)} className="ml-2 text-white/40 hover:text-white transition-colors">
                      {s.is_active
                        ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                        : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </div>
                  {s.description && (
                    <p className="text-xs text-white/50 mb-3 line-clamp-2">{s.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="bg-white/5 rounded-lg px-3 py-2">
                      <p className="text-white/40">Harga</p>
                      <p className="font-bold text-blue-400">{formatCurrency(s.price_per_hour)}<span className="font-normal text-white/40">/{s.unit}</span></p>
                    </div>
                    <div className="bg-white/5 rounded-lg px-3 py-2">
                      <p className="text-white/40">Kapasitas</p>
                      <p className="font-bold text-white">{s.capacity} orang</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => deleteService(s.id, s.name)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Layanan" : "Tambah Layanan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Nama Layanan *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Lapangan Futsal A" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Satuan</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="sesi / jam" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Harga (Rp)</Label>
                <Input type="number" value={form.price_per_hour} onChange={(e) => setForm({ ...form, price_per_hour: parseInt(e.target.value) || 0 })} className="mt-1" />
              </div>
              <div>
                <Label>Kapasitas (orang)</Label>
                <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opsional" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Urutan Tampil</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.is_active ? "active" : "inactive"} onValueChange={(v) => setForm({ ...form, is_active: v === "active" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Batal</Button>
              <Button className="flex-1" onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
