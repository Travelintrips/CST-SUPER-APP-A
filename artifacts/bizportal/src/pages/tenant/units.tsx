import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Search, Pencil, Trash2, RefreshCw } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

type Unit = {
  id: number; company_id: number; unit_code: string; name: string; area_name: string;
  unit_type: string; area_sqm: number | null; monthly_rate: number | null;
  status: string; notes: string | null;
};

const UNIT_TYPE_LABEL: Record<string, string> = {
  food_booth: "Food Booth", beverage_booth: "Beverage Booth", retail: "Retail",
  service: "Jasa", office: "Kantor", warehouse: "Gudang", other: "Lainnya",
};

const STATUS_COLOR: Record<string, string> = {
  available: "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  occupied: "bg-blue-900/30 text-blue-300 border-blue-700",
  maintenance: "bg-yellow-900/30 text-yellow-300 border-yellow-700",
  inactive: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<string, string> = {
  available: "Tersedia", occupied: "Terisi", maintenance: "Perawatan", inactive: "Nonaktif",
};

const emptyForm = {
  unit_code: "", name: "", area_name: "", unit_type: "food_booth",
  area_sqm: "", monthly_rate: "", status: "available", notes: "",
};

export default function TenantUnits() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<{ data: Unit[]; total: number }>({
    queryKey: ["tenant-units", activeCompanyId, search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (search) qs.set("search", search);
      const r = await fetch(`/api/tenant/units?${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url = editId ? `/api/tenant/units/${editId}` : "/api/tenant/units";
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editId ? "Unit diperbarui" : "Unit ditambahkan" });
      setShowDialog(false); setForm(emptyForm); setEditId(null);
      qc.invalidateQueries({ queryKey: ["tenant-units"] });
      qc.invalidateQueries({ queryKey: ["tenant-dashboard"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tenant/units/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Unit dihapus" });
      qc.invalidateQueries({ queryKey: ["tenant-units"] });
      qc.invalidateQueries({ queryKey: ["tenant-dashboard"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function openEdit(u: Unit) {
    setEditId(u.id);
    setForm({
      unit_code: u.unit_code, name: u.name, area_name: u.area_name,
      unit_type: u.unit_type, area_sqm: u.area_sqm ? String(u.area_sqm) : "",
      monthly_rate: u.monthly_rate ? String(u.monthly_rate) : "",
      status: u.status, notes: u.notes ?? "",
    });
    setShowDialog(true);
  }

  const rows = data?.data ?? [];

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-teal-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Unit Kantin</h1>
              <p className="text-sm text-muted-foreground">Total: {data?.total ?? 0} unit</p>
            </div>
          </div>
          <Button size="sm" className="gap-1" onClick={() => { setEditId(null); setForm(emptyForm); setShowDialog(true); }}>
            <Plus className="h-4 w-4" /> Tambah Unit
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Cari kode / nama unit…" className="h-8 text-xs pl-7 w-64"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["Kode Unit", "Nama", "Area", "Tipe", "Luas (m²)", "Tarif/Bulan", "Status", ""].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Memuat…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Belum ada unit</td></tr>
                ) : rows.map((u) => (
                  <tr key={u.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{u.unit_code}</td>
                    <td className="py-2.5 px-3 font-medium text-foreground whitespace-nowrap">{u.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">{u.area_name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">{UNIT_TYPE_LABEL[u.unit_type] ?? u.unit_type}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">{u.area_sqm ? `${u.area_sqm} m²` : "—"}</td>
                    <td className="py-2.5 px-3 font-medium text-foreground text-right whitespace-nowrap">{u.monthly_rate ? idr(Number(u.monthly_rate)) : "—"}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <Badge className={`${STATUS_COLOR[u.status] ?? "bg-muted text-muted-foreground"} text-xs`}>
                        {STATUS_LABEL[u.status] ?? u.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => openEdit(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-red-400 hover:text-red-300"
                        onClick={() => { if (confirm(`Hapus unit "${u.name}"?`)) deleteMutation.mutate(u.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={(o) => { if (!o) { setShowDialog(false); setEditId(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Edit Unit" : "Tambah Unit"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Kode Unit *</Label>
                  <Input value={form.unit_code} onChange={(e) => setForm((p) => ({ ...p, unit_code: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nama Unit *</Label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Area / Lokasi</Label>
                <Input value={form.area_name} onChange={(e) => setForm((p) => ({ ...p, area_name: e.target.value }))} placeholder="contoh: Area Kantin Lantai 1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipe Unit</Label>
                <Select value={form.unit_type} onValueChange={(v) => setForm((p) => ({ ...p, unit_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(UNIT_TYPE_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Luas (m²)</Label>
                  <Input type="number" min={0} value={form.area_sqm} onChange={(e) => setForm((p) => ({ ...p, area_sqm: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tarif / Bulan (IDR)</Label>
                  <Input type="number" min={0} value={form.monthly_rate} onChange={(e) => setForm((p) => ({ ...p, monthly_rate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Tersedia</SelectItem>
                    <SelectItem value="occupied">Terisi</SelectItem>
                    <SelectItem value="maintenance">Perawatan</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catatan</Label>
                <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditId(null); setForm(emptyForm); }}>Batal</Button>
              <Button disabled={!form.unit_code || !form.name || saveMutation.isPending}
                onClick={() => saveMutation.mutate({
                  company_id: activeCompanyId ?? 1,
                  unit_code: form.unit_code, name: form.name, area_name: form.area_name,
                  unit_type: form.unit_type, area_sqm: form.area_sqm ? Number(form.area_sqm) : null,
                  monthly_rate: form.monthly_rate ? Number(form.monthly_rate) : null,
                  status: form.status, notes: form.notes || null,
                })}>
                {saveMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
