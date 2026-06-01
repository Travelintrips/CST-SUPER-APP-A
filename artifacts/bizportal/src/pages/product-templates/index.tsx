import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, ChevronRight, FileText, ListChecks, Layout, Trash2, Link2, Copy } from "lucide-react";

interface ProductTemplateRow {
  id: number;
  categoryKey: string;
  label: string;
  icon: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  version: string;
  customFields: unknown[];
  requiredDocuments: unknown[];
  checklist: unknown[];
}

const API_BASE = "/api/product-templates";
const QUERY_KEY = ["product-templates-raw"];

async function fetchTemplates(): Promise<ProductTemplateRow[]> {
  const res = await fetch(`${API_BASE}?raw=1`);
  if (!res.ok) throw new Error("Gagal mengambil data template");
  return res.json();
}

async function createTemplate(body: {
  categoryKey: string;
  label: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
}): Promise<ProductTemplateRow> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Gagal membuat template");
  }
  return res.json();
}

async function deleteTemplate(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Gagal menghapus template");
  }
}

async function duplicateTemplate(id: number): Promise<ProductTemplateRow> {
  const res = await fetch(`${API_BASE}/${id}/duplicate`, { method: "POST" });
  if (!res.ok) throw new Error("Gagal menduplikasi template");
  return res.json();
}

export default function ProductTemplatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ categoryKey: "", label: "", icon: "", description: "", sortOrder: "" });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTemplates,
  });

  const createMut = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setCreateOpen(false);
      setForm({ categoryKey: "", label: "", icon: "", description: "", sortOrder: "" });
      toast({ title: "Template berhasil dibuat" });
    },
    onError: (err) => {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Template dihapus" });
      setDeleteId(null);
    },
    onError: (err) => {
      toast({ title: "Gagal", description: String(err), variant: "destructive" });
    },
  });

  const duplicateMut = useMutation({
    mutationFn: duplicateTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Template diduplikasi" });
    },
    onError: (err) => {
      toast({ title: "Gagal duplikasi", description: String(err), variant: "destructive" });
    },
  });

  const filtered = templates.filter(
    (t) =>
      t.label.toLowerCase().includes(search.toLowerCase()) ||
      t.categoryKey.toLowerCase().includes(search.toLowerCase())
  );

  const totalFields = templates.reduce((s, t) => s + (t.customFields?.length ?? 0), 0);
  const totalDocs = templates.reduce((s, t) => s + (t.requiredDocuments?.length ?? 0), 0);

  const handleCreate = () => {
    if (!form.categoryKey.trim() || !form.label.trim()) {
      toast({ title: "Category Key dan Label wajib diisi", variant: "destructive" });
      return;
    }
    createMut.mutate({
      categoryKey: form.categoryKey.trim(),
      label: form.label.trim(),
      icon: form.icon.trim() || undefined,
      description: form.description.trim() || undefined,
      sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : 0,
    });
  };

  const handleCopyLink = (tpl: ProductTemplateRow, e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${window.location.origin}/bizportal/product-templates/${tpl.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link disalin", description: tpl.label });
  };

  const deleteTarget = templates.find((t) => t.id === deleteId);

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Product Template Engine</h1>
              <p className="text-sm text-muted-foreground">
                Referensi template komoditas — custom fields, dokumen wajib, checklist, dan instruksi pengemasan per kategori barang.
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Tambah Template
          </Button>
        </div>

        {/* Stats Banner */}
        <div className="rounded-xl bg-gradient-to-br from-primary to-violet-600 text-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Layout className="w-5 h-5" />
            <span className="font-semibold text-lg">Product Template Engine</span>
          </div>
          <p className="text-sm text-white/80 mb-4">
            Template komoditas untuk form vendor — custom fields, dokumen, checklist, dan instruksi pengemasan per jenis barang.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Komoditas", value: templates.length },
              { label: "Custom Fields", value: totalFields },
              { label: "Dok Terkonfigurasi", value: totalDocs },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-white/80">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-5 space-y-3">
                  <div className="h-5 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              {search ? `Tidak ada template untuk "${search}"` : "Belum ada template. Tambah sekarang!"}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((tpl) => (
              <Link key={tpl.id} href={`/product-templates/${tpl.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow border group">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{tpl.icon ?? "📦"}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {tpl.label}
                            </span>
                            {!tpl.isActive && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1">Nonaktif</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{tpl.categoryKey}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </div>

                    {tpl.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
                    )}

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: "Fields", value: tpl.customFields?.length ?? 0, color: "text-blue-600" },
                        { label: "Dok Wajib", value: tpl.requiredDocuments?.length ?? 0, color: "text-orange-600" },
                        { label: "Checklist", value: tpl.checklist?.length ?? 0, color: "text-green-600" },
                      ].map((s) => (
                        <div key={s.label} className="bg-muted/50 rounded-md p-1.5">
                          <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                          <div className="text-[10px] text-muted-foreground">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Version */}
                    <div className="flex items-center justify-between pt-0.5">
                      <Badge variant="outline" className="text-[10px] py-0 font-mono">v{tpl.version}</Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1" onClick={(e) => e.preventDefault()}>
                      <Link href={`/product-templates/${tpl.id}`}>
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs">
                          <FileText className="w-3.5 h-3.5" />
                          Detail
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={(e) => handleCopyLink(tpl, e)}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Buat Link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.preventDefault();
                          duplicateMut.mutate(tpl.id);
                        }}
                        title="Duplikasi"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive px-2"
                        onClick={(e) => {
                          e.preventDefault();
                          setDeleteId(tpl.id);
                        }}
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Template Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Category Key <span className="text-destructive">*</span></Label>
              <Input
                placeholder="cth. crude_oil"
                value={form.categoryKey}
                onChange={(e) => setForm((f) => ({ ...f, categoryKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
              />
              <p className="text-xs text-muted-foreground">Unik, huruf kecil dan underscore saja</p>
            </div>
            <div className="space-y-1.5">
              <Label>Label / Nama <span className="text-destructive">*</span></Label>
              <Input
                placeholder="cth. Minyak Mentah"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon (emoji, opsional)</Label>
              <Input
                placeholder="cth. 🛢️"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi (opsional)</Label>
              <Textarea
                placeholder="Deskripsi singkat komoditas..."
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Urutan (opsional)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isActive
                ? "Template aktif tidak dapat dihapus. Nonaktifkan terlebih dahulu melalui halaman detail."
                : "Semua konfigurasi pada template ini akan ikut terhapus. Tindakan ini tidak bisa dibatalkan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            {!deleteTarget?.isActive && (
              <AlertDialogAction
                onClick={() => deleteId !== null && deleteMut.mutate(deleteId)}
                className="bg-destructive hover:bg-destructive/90"
              >
                Hapus
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
