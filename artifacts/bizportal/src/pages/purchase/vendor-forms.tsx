import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Plus, Trash2, Eye, ToggleLeft, ToggleRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type FormLink = {
  id: number;
  token: string;
  supplierId: number | null;
  serviceType: string;
  title: string | null;
  notes: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  vendorName: string | null;
};

type Submission = {
  id: number;
  linkId: number | null;
  token: string;
  supplierId: number | null;
  serviceType: string;
  vendorName: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  formData: Record<string, unknown>;
  submittedAt: string;
};

type Supplier = { id: number; name: string; serviceType: string | null };

// ── Schema labels ──────────────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; emoji: string }> = {
  product: { label: "Produk", emoji: "📦" },
  trucking: { label: "Trucking", emoji: "🚛" },
  air_freight: { label: "Air Freight", emoji: "✈️" },
  sea_freight: { label: "Sea Freight", emoji: "🚢" },
  ppjk: { label: "PPJK", emoji: "📋" },
  customs_clearance: { label: "Customs Clearance", emoji: "🛃" },
  warehouse: { label: "Warehouse", emoji: "🏭" },
  handling: { label: "Handling", emoji: "🔧" },
  exim_service: { label: "Exim Service", emoji: "🌐" },
};

const SERVICE_TYPES = Object.keys(SERVICE_META);

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "API error");
  return data;
}

function buildFormUrl(token: string): string {
  const domain = window.location.origin;
  return `${domain}/vendor-mini-form/${token}`;
}

// ── Create link dialog ─────────────────────────────────────────────────────────

function CreateLinkDialog({ suppliers, onCreated }: { suppliers: Supplier[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const reset = () => {
    setServiceType(""); setSupplierId(""); setTitle(""); setNotes(""); setExpiresInDays("");
  };

  const handleCreate = async () => {
    if (!serviceType) { toast({ title: "Pilih service type dulu", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await apiFetch("/api/vendor-form/admin/links", {
        method: "POST",
        body: JSON.stringify({
          serviceType,
          supplierId: supplierId ? Number(supplierId) : undefined,
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        }),
      });
      toast({ title: "Link berhasil dibuat" });
      onCreated();
      setOpen(false);
      reset();
    } catch (e: unknown) {
      toast({ title: "Gagal membuat link", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Buat Link Form</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Buat Link Form Baru</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Service Type <span className="text-red-500">*</span></Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger><SelectValue placeholder="Pilih tipe layanan" /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map(k => (
                  <SelectItem key={k} value={k}>
                    {SERVICE_META[k]!.emoji} {SERVICE_META[k]!.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor (opsional)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Semua vendor / tidak spesifik" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Tidak spesifik —</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Judul Form (opsional)</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Penawaran Rate Trucking Q3 2025" />
          </div>
          <div className="space-y-1.5">
            <Label>Instruksi / Catatan untuk Vendor</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Masukkan instruksi khusus untuk vendor..." />
          </div>
          <div className="space-y-1.5">
            <Label>Kadaluarsa (hari, opsional)</Label>
            <Input type="number" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} placeholder="Contoh: 7 (kosongkan = tidak ada batas)" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Membuat..." : "Buat Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Submission detail dialog ───────────────────────────────────────────────────

function SubmissionDetailDialog({ submission }: { submission: Submission }) {
  const [open, setOpen] = useState(false);
  const meta = SERVICE_META[submission.serviceType];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {meta?.emoji} Detail Submission — {submission.vendorName ?? "—"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Service Type</span><p className="font-medium">{meta?.label ?? submission.serviceType}</p></div>
            <div><span className="text-slate-500">Dikirim</span><p className="font-medium">{new Date(submission.submittedAt).toLocaleString("id-ID")}</p></div>
            {submission.contactPerson && <div><span className="text-slate-500">Contact Person</span><p className="font-medium">{submission.contactPerson}</p></div>}
            {submission.contactPhone && <div><span className="text-slate-500">Telepon</span><p className="font-medium">{submission.contactPhone}</p></div>}
          </div>
          <hr />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-600">Data Form</p>
            {Object.entries(submission.formData).filter(([, v]) => v !== "" && v !== null && v !== undefined).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-slate-50 py-1.5">
                <span className="text-slate-500 capitalize">{k.replace(/_/g, " ")}</span>
                <span className="font-medium text-right max-w-[60%]">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function VendorFormsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: links = [], isLoading: linksLoading } = useQuery<FormLink[]>({
    queryKey: ["vendor-form-links"],
    queryFn: () => apiFetch("/api/vendor-form/admin/links"),
  });

  const { data: submissions = [], isLoading: subsLoading } = useQuery<Submission[]>({
    queryKey: ["vendor-form-submissions"],
    queryFn: () => apiFetch("/api/vendor-form/admin/submissions"),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers-list"],
    queryFn: () => apiFetch("/api/trading/suppliers"),
  });

  const toggleLink = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/api/vendor-form/admin/links/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-form-links"] }),
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteLink = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/vendor-form/admin/links/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Link dihapus" });
      qc.invalidateQueries({ queryKey: ["vendor-form-links"] });
      qc.invalidateQueries({ queryKey: ["vendor-form-submissions"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteSubmission = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/vendor-form/admin/submissions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Submission dihapus" });
      qc.invalidateQueries({ queryKey: ["vendor-form-submissions"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(buildFormUrl(token));
    toast({ title: "Link disalin!" });
  };

  const submissionsByToken = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of submissions) map[s.token] = (map[s.token] ?? 0) + 1;
    return map;
  }, [submissions]);

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Link2 className="h-6 w-6 text-indigo-500" />
              Vendor Mini Form
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Buat link form dinamis untuk vendor mengisi data rate/layanan sesuai service type.
            </p>
          </div>
          <CreateLinkDialog suppliers={suppliers} onCreated={() => qc.invalidateQueries({ queryKey: ["vendor-form-links"] })} />
        </div>

        <Tabs defaultValue="links">
          <TabsList>
            <TabsTrigger value="links">
              Link Form
              <Badge variant="secondary" className="ml-2">{links.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="submissions">
              Submission Masuk
              <Badge variant="secondary" className="ml-2">{submissions.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* ── Links tab ── */}
          <TabsContent value="links">
            <Card>
              <CardContent className="p-0">
                {linksLoading ? (
                  <div className="py-12 text-center text-slate-400 text-sm">Memuat...</div>
                ) : links.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Belum ada link form. Klik <strong>Buat Link Form</strong> untuk memulai.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Judul / Service Type</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Kadaluarsa</TableHead>
                        <TableHead>Submission</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.map(link => {
                        const meta = SERVICE_META[link.serviceType];
                        const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
                        const subCount = submissionsByToken[link.token] ?? 0;
                        return (
                          <TableRow key={link.id}>
                            <TableCell>
                              <div className="font-medium text-slate-800">
                                {meta?.emoji} {link.title ?? `Form ${meta?.label ?? link.serviceType}`}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5">{link.token.slice(0, 16)}...</div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{link.vendorName ?? <span className="text-slate-400">Umum</span>}</span>
                            </TableCell>
                            <TableCell>
                              {link.expiresAt ? (
                                <span className={expired ? "text-red-500 text-xs" : "text-sm"}>
                                  {expired ? "⚠️ Kadaluarsa" : new Date(link.expiresAt).toLocaleDateString("id-ID")}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">Tidak ada batas</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={subCount > 0 ? "default" : "secondary"}>
                                {subCount} masuk
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={link.isActive && !expired ? "default" : "secondary"}>
                                {link.isActive && !expired ? "Aktif" : "Nonaktif"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  title="Salin link"
                                  onClick={() => copyLink(link.token)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <a href={buildFormUrl(link.token)} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Buka form">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  title={link.isActive ? "Nonaktifkan" : "Aktifkan"}
                                  onClick={() => toggleLink.mutate({ id: link.id, isActive: !link.isActive })}
                                >
                                  {link.isActive
                                    ? <ToggleRight className="h-4 w-4 text-green-500" />
                                    : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                                  title="Hapus link"
                                  onClick={() => { if (confirm("Hapus link ini? Semua submission terkait tetap tersimpan.")) deleteLink.mutate(link.id); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Submissions tab ── */}
          <TabsContent value="submissions">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Semua Submission Vendor</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {subsLoading ? (
                  <div className="py-12 text-center text-slate-400 text-sm">Memuat...</div>
                ) : submissions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Belum ada submission. Bagikan link form ke vendor untuk mulai menerima data.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Highlight</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map(sub => {
                        const meta = SERVICE_META[sub.serviceType];
                        const fd = sub.formData ?? {};
                        const highlight = getHighlight(sub.serviceType, fd);
                        return (
                          <TableRow key={sub.id}>
                            <TableCell>
                              <div className="font-medium text-slate-800">{sub.vendorName ?? "—"}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{meta?.emoji} {meta?.label ?? sub.serviceType}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{sub.contactPerson ?? "—"}</div>
                              {sub.contactPhone && <div className="text-xs text-slate-400">{sub.contactPhone}</div>}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{new Date(sub.submittedAt).toLocaleDateString("id-ID")}</span>
                              <div className="text-xs text-slate-400">{new Date(sub.submittedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-slate-600">{highlight}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <SubmissionDetailDialog submission={sub} />
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                                  title="Hapus submission"
                                  onClick={() => { if (confirm("Hapus submission ini?")) deleteSubmission.mutate(sub.id); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function getHighlight(serviceType: string, fd: Record<string, unknown>): string {
  const fmt = (v: unknown) => v ? String(v) : "—";
  const fmtRp = (v: unknown) => v ? `Rp ${Number(v).toLocaleString("id-ID")}` : "—";
  switch (serviceType) {
    case "trucking": return `${fmt(fd["truck_type"])} · ${fmtRp(fd["price"])}/trip · ${fmt(fd["eta"])}`;
    case "air_freight": return `${fmt(fd["airline"])} · ${fmt(fd["origin"])}→${fmt(fd["destination"])} · ${fmtRp(fd["freight_charge"])}/kg`;
    case "sea_freight": return `${fmt(fd["shipping_line"])} · ${fmt(fd["container_type"])} · $${fmt(fd["freight_rate"])}`;
    case "ppjk": return `${fmt(fd["pib_type"])} · Jasa ${fmtRp(fd["customs_service"])}`;
    case "customs_clearance": return `${fmt(fd["clearance_type"])} · ${fmtRp(fd["service_fee"])}`;
    case "warehouse": return `${fmt(fd["location"])} · ${fmt(fd["area_sqm"])}m² · ${fmtRp(fd["storage_rate"])}/m²/bln`;
    case "handling": return `${fmt(fd["handling_type"])} · ${fmtRp(fd["price_per_unit"])} ${fmt(fd["unit"])}`;
    case "exim_service": return `${fmt(fd["service_type"])} · ${fmt(fd["origin_country"])}→${fmt(fd["dest_country"])}`;
    case "product": return `${fmt(fd["product_name"])} · ${fmt(fd["qty"])} ${fmt(fd["unit"])} · ${fmtRp(fd["unit_price"])}`;
    default: return Object.values(fd).filter(Boolean).slice(0, 2).map(String).join(" · ");
  }
}
