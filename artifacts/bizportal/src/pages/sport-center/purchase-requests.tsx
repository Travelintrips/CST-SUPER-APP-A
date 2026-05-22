import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ShoppingCart, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface PRItem { name: string; qty: number; unit: string; estimatedPrice: number; }

interface PR {
  id: number;
  pr_number: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  requested_by: string;
  items: PRItem[];
  total_estimated: number;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

const CATEGORIES = ["Maintenance", "Peralatan", "Kebersihan", "Keamanan", "Renovasi", "Lainnya"];
const PRIORITIES = [{ value: "low", label: "Rendah" }, { value: "normal", label: "Normal" }, { value: "high", label: "Tinggi" }, { value: "urgent", label: "Urgent" }];
const STATUSES = [{ value: "draft", label: "Draft" }, { value: "submitted", label: "Diajukan" }, { value: "approved", label: "Disetujui" }, { value: "rejected", label: "Ditolak" }, { value: "completed", label: "Selesai" }];

const STATUS_STYLE: Record<string, string> = {
  draft:     "bg-white/10 text-white/60",
  submitted: "bg-blue-500/20 text-blue-300",
  approved:  "bg-emerald-500/20 text-emerald-300",
  rejected:  "bg-red-500/20 text-red-300",
  completed: "bg-violet-500/20 text-violet-300",
};
const PRIORITY_STYLE: Record<string, string> = {
  low:    "bg-white/10 text-white/50",
  normal: "bg-blue-500/20 text-blue-300",
  high:   "bg-amber-500/20 text-amber-300",
  urgent: "bg-red-500/20 text-red-300",
};

const EMPTY_PR = {
  title: "", description: "", category: "Maintenance", priority: "normal",
  requestedBy: "", notes: "", status: "draft", approvedBy: "",
};

export default function SportCenterPurchaseRequestsPage() {
  const { toast } = useToast();
  const [prs, setPRs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PR | null>(null);
  const [form, setForm] = useState(EMPTY_PR);
  const [items, setItems] = useState<PRItem[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchPRs = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sport-center/admin/purchase-requests");
      setPRs(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPRs(); }, []);

  function openNew() {
    setEditing(null); setForm(EMPTY_PR);
    setItems([{ name: "", qty: 1, unit: "pcs", estimatedPrice: 0 }]);
    setOpen(true);
  }

  function openEdit(pr: PR) {
    setEditing(pr);
    setForm({ title: pr.title, description: pr.description ?? "", category: pr.category, priority: pr.priority, requestedBy: pr.requested_by, notes: pr.notes ?? "", status: pr.status, approvedBy: pr.approved_by ?? "" });
    setItems(pr.items.length > 0 ? pr.items : [{ name: "", qty: 1, unit: "pcs", estimatedPrice: 0 }]);
    setOpen(true);
  }

  function addItem() { setItems([...items, { name: "", qty: 1, unit: "pcs", estimatedPrice: 0 }]); }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof PRItem, value: string | number) {
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  const totalEstimated = items.reduce((sum, item) => sum + (item.qty * item.estimatedPrice), 0);

  async function save() {
    if (!form.title.trim() || !form.requestedBy.trim()) {
      toast({ title: "Judul dan pemohon wajib diisi", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const body = { ...form, items, totalEstimated };
      const url = editing ? `/api/sport-center/admin/purchase-requests/${editing.id}` : "/api/sport-center/admin/purchase-requests";
      const r = await fetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editing ? "PR diperbarui" : "PR dibuat" });
      setOpen(false); fetchPRs();
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deletePR(id: number, title: string) {
    if (!confirm(`Hapus PR "${title}"?`)) return;
    try {
      await fetch(`/api/sport-center/admin/purchase-requests/${id}`, { method: "DELETE" });
      setPRs((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "PR dihapus" });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  }

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Purchase Request</h1>
            <p className="text-sm text-white/60 mt-0.5">Ajukan kebutuhan pembelian dan maintenance Sport Center</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Buat PR
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-white/10 animate-pulse" />)}</div>
        ) : prs.length === 0 ? (
          <div className="py-20 text-center text-white/40">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada purchase request</p>
            <Button onClick={openNew} variant="outline" className="mt-4 gap-2"><Plus className="w-4 h-4" /> Buat pertama</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {prs.map((pr) => (
              <Card key={pr.id} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-white/50">{pr.pr_number}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[pr.status] ?? ""}`}>
                          {STATUSES.find((s) => s.value === pr.status)?.label ?? pr.status}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[pr.priority] ?? ""}`}>
                          {PRIORITIES.find((p) => p.value === pr.priority)?.label ?? pr.priority}
                        </span>
                        <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">{pr.category}</span>
                      </div>
                      <p className="font-semibold text-white">{pr.title}</p>
                      {pr.description && <p className="text-xs text-white/50 mt-0.5 line-clamp-1">{pr.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/50">
                        <span>Pemohon: <strong className="text-white/80">{pr.requested_by}</strong></span>
                        <span>{pr.items.length} item</span>
                        <span className="font-semibold text-blue-400">{formatCurrency(pr.total_estimated)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => openEdit(pr)}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20" onClick={() => deletePR(pr.id, pr.title)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Purchase Request" : "Buat Purchase Request"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Judul PR *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contoh: Perbaikan AC Ruang Yoga" className="mt-1" />
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
                <Label>Prioritas</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pemohon *</Label>
                <Input value={form.requestedBy} onChange={(e) => setForm({ ...form, requestedBy: e.target.value })} placeholder="Nama / Divisi" className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opsional" className="mt-1" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Daftar Item</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs h-7">
                  <Plus className="w-3.5 h-3.5" /> Tambah Item
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_60px_60px_100px_32px] gap-2 items-center bg-white/5 rounded-lg p-2">
                    <Input value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Nama item" className="text-xs h-8" />
                    <Input type="number" value={item.qty} onChange={(e) => updateItem(i, "qty", parseInt(e.target.value) || 1)} placeholder="Qty" className="text-xs h-8 text-center" />
                    <Input value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} placeholder="Satuan" className="text-xs h-8" />
                    <Input type="number" value={item.estimatedPrice} onChange={(e) => updateItem(i, "estimatedPrice", parseInt(e.target.value) || 0)} placeholder="Harga" className="text-xs h-8" />
                    <button onClick={() => removeItem(i)} className="text-white/40 hover:text-red-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <span className="text-sm font-semibold text-blue-400">
                  Total Estimasi: {formatCurrency(totalEstimated)}
                </span>
              </div>
            </div>
            <div>
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" className="mt-1" />
            </div>
            {(form.status === "approved" || editing?.approved_by) && (
              <div>
                <Label>Disetujui Oleh</Label>
                <Input value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} placeholder="Nama penyetuju" className="mt-1" />
              </div>
            )}
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
