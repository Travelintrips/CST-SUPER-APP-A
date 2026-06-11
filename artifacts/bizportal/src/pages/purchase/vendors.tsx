import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GooglePlacesAutocomplete } from "@/components/ui/google-places-autocomplete";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useListTaxes,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import type { Supplier } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, Globe, Pencil, Plus, Store, Trash2, Upload, X } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { useLanguage } from "@/contexts/LanguageContext";

const SERVICE_TYPES = [
  "Import", "Export", "Domestic", "Door to Door",
  "Air Freight", "Sea Freight", "Domestic Freight",
  "Import Customs", "Export Customs", "Trucking", "Handling",
];

const ETA_OPTIONS = [
  "1-2 hari", "2-3 hari", "3-5 hari", "5-7 hari",
  "1-2 minggu", "2-4 minggu", "1 bulan+",
];

type Company = {
  id: number;
  companyName: string;
  companyCode: string;
  isActive: boolean;
  isHolding: boolean;
};

function getLogoServeUrl(path: string) {
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  return path;
}

function isImageUrl(val: string) {
  return val.startsWith("http") || val.startsWith("/api/") || val.startsWith("/objects/");
}

function LogoDisplay({ logo }: { logo: string | null | undefined }) {
  if (!logo) return <span className="text-muted-foreground text-xs">—</span>;
  if (isImageUrl(logo)) {
    return <img src={getLogoServeUrl(logo)} alt="logo" className="h-6 w-6 object-contain rounded" />;
  }
  return <span className="text-base">{logo}</span>;
}

function CompanyAssignmentBadges({
  assignedIds,
  companies,
}: {
  assignedIds: number[];
  companies: Company[];
}) {
  if (!assignedIds || assignedIds.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Globe className="h-3 w-3" /> Global
      </span>
    );
  }
  const names = assignedIds
    .map((id) => companies.find((c) => c.id === id)?.companyCode ?? `#${id}`)
    .slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((n) => (
        <Badge key={n} variant="outline" className="text-xs px-1.5 py-0">
          {n}
        </Badge>
      ))}
      {assignedIds.length > 3 && (
        <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
          +{assignedIds.length - 3}
        </Badge>
      )}
    </div>
  );
}

type FormState = {
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
  fee: string;
  note: string;
  sortOrder: string;
  hasInternalTruck: boolean;
  internalTruckPrice: string;
};

const emptyForm = (): FormState => ({
  name: "",
  country: "",
  contactEmail: "",
  contactPerson: "",
  phone: "",
  address: "",
  taxId: "",
  defaultPurchaseTaxId: null,
  serviceType: "",
  isActive: true,
  logo: "📦",
  eta: "",
  fee: "0",
  note: "",
  sortOrder: "0",
  hasInternalTruck: false,
  internalTruckPrice: "",
});

export default function VendorsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: vendors } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const { data: taxes } = useListTaxes();
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();

  const purchaseTaxes = (taxes ?? []).filter((t) => t.kind === "purchase" && t.isActive);

  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [logoUploading, setLogoUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Company assignment state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignedCompanyIds, setAssignedCompanyIds] = useState<number[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);

  // Filter & bulk assign state
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignCompanyId, setBulkAssignCompanyId] = useState<string>("");
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // Fetch companies list
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((data: Company[]) => {
        setCompanies((data ?? []).filter((c) => !c.isHolding && c.isActive));
      })
      .catch(() => {});
  }, []);

  // Fetch existing assignments when editing a vendor
  useEffect(() => {
    if (!editing) {
      setAssignedCompanyIds([]);
      return;
    }
    fetch(`/api/trading/suppliers/${editing.id}/companies`)
      .then((r) => r.json())
      .then((data: { companyIds: number[] }) => {
        setAssignedCompanyIds(data.companyIds ?? []);
      })
      .catch(() => {
        setAssignedCompanyIds([]);
      });
  }, [editing]);

  const toggleAssignedCompany = (companyId: number) => {
    setAssignedCompanyIds((prev) =>
      prev.includes(companyId) ? prev.filter((id) => id !== companyId) : [...prev, companyId]
    );
  };

  const saveAssignments = async (vendorId: number) => {
    setSavingAssignments(true);
    try {
      await fetch(`/api/trading/suppliers/${vendorId}/companies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: assignedCompanyIds }),
      });
    } finally {
      setSavingAssignments(false);
    }
  };

  const { uploadFile } = useUpload({
    onError: () => {
      toast({ title: t.common.error, variant: "destructive" });
      setLogoUploading(false);
    },
  });

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const result = await uploadFile(file);
      if (result?.objectPath) {
        set("logo", result.objectPath);
        toast({ title: t.common.success });
      }
    } finally {
      setLogoUploading(false);
    }
  };

  const toggleServiceType = (type: string) => {
    const current = form.serviceType
      ? form.serviceType.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const idx = current.findIndex((s) => s.toLowerCase() === type.toLowerCase());
    if (idx >= 0) current.splice(idx, 1);
    else current.push(type);
    set("serviceType", current.join(", "));
  };

  const selectedServiceTypes = form.serviceType
    ? form.serviceType.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const set = (k: keyof FormState, v: FormState[keyof FormState]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setEditing(null);
    setForm(emptyForm());
    setAssignedCompanyIds([]);
  };

  const startEdit = (v: Supplier) => {
    setEditing(v);
    setForm({
      hasInternalTruck: (v as any).hasInternalTruck ?? false,
      internalTruckPrice: (v as any).internalTruckPrice != null ? String((v as any).internalTruckPrice) : "",
      name: v.name,
      country: v.country ?? "",
      contactEmail: v.contactEmail ?? "",
      contactPerson: (v as { contactPerson?: string | null }).contactPerson ?? "",
      phone: v.phone ?? "",
      address: v.address ?? "",
      taxId: v.taxId ?? "",
      defaultPurchaseTaxId: v.defaultPurchaseTaxId ?? null,
      serviceType: v.serviceType ?? "",
      isActive: v.isActive ?? true,
      logo: v.logo ?? "📦",
      eta: v.eta ?? "",
      fee: String(v.fee ?? 0),
      note: v.note ?? "",
      sortOrder: String(v.sortOrder ?? 0),
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    const body = {
      name: form.name.trim(),
      country: form.country || null,
      contactEmail: form.contactEmail || null,
      contactPerson: form.contactPerson || null,
      phone: form.phone || null,
      address: form.address || null,
      taxId: form.taxId || null,
      defaultPurchaseTaxId: form.defaultPurchaseTaxId,
      serviceType: form.serviceType || null,
      isActive: form.isActive,
      logo: form.logo || "📦",
      eta: form.eta || null,
      fee: parseFloat(form.fee) || 0,
      note: form.note || null,
      sortOrder: parseInt(form.sortOrder) || 0,
      hasInternalTruck: form.hasInternalTruck,
      internalTruckPrice: form.hasInternalTruck && form.internalTruckPrice
        ? parseFloat(form.internalTruckPrice) || null
        : null,
    };
    try {
      if (editing) {
        const updated = await updateMut.mutateAsync({ id: editing.id, data: body });
        await saveAssignments(editing.id);
        qc.setQueryData<Supplier[]>(getListSuppliersQueryKey(), (old) =>
          old ? old.map((s) => (s.id === updated.id ? updated : s)) : [updated]
        );
        qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: t.common.success });
      } else {
        const created = await createMut.mutateAsync({ data: body });
        await saveAssignments(created.id);
        qc.setQueryData<Supplier[]>(getListSuppliersQueryKey(), (old) =>
          old ? [...old, created] : [created]
        );
        qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
        toast({ title: t.common.success });
      }
      reset();
      setOpen(false);
    } catch (e) {
      toast({ title: t.common.error, description: String(e), variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Hapus vendor ini?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      toast({ title: t.common.success });
    } catch (e) {
      toast({ title: t.common.error, description: String(e), variant: "destructive" });
    }
  };

  const rawList = vendors ?? [];
  const allList = filterCompanyId === "all"
    ? rawList
    : filterCompanyId === "__unassigned__"
      ? rawList.filter((v) => (v as { companyId?: number | null }).companyId == null)
      : rawList.filter((v) => String((v as { companyId?: number | null }).companyId) === filterCompanyId);
  const allSelected = allList.length > 0 && allList.every((v) => selectedIds.has(v.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allList.map((v) => v.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} vendor terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBulkDeleting(true);
    let success = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await deleteMut.mutateAsync({ id });
        success++;
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
    if (failed === 0) {
      toast({ title: `${success} vendor berhasil dihapus` });
    } else {
      toast({ title: `${success} berhasil, ${failed} gagal`, variant: "destructive" });
    }
  };

  const handleBulkAssignCompany = async () => {
    if (selectedIds.size === 0 || !bulkAssignCompanyId) return;
    setBulkAssigning(true);
    try {
      const res = await fetch("/api/trading/suppliers/bulk-assign-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorIds: Array.from(selectedIds),
          companyId: bulkAssignCompanyId === "__unassign__" ? null : Number(bulkAssignCompanyId),
        }),
      });
      if (!res.ok) throw new Error("Gagal assign company");
      const cName = bulkAssignCompanyId === "__unassign__"
        ? "Global (tidak di-assign)"
        : companies.find(c => String(c.id) === bulkAssignCompanyId)?.companyName ?? bulkAssignCompanyId;
      toast({ title: `${selectedIds.size} vendor di-assign ke ${cName}` });
      setSelectedIds(new Set());
      setBulkAssignOpen(false);
      setBulkAssignCompanyId("");
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
    } catch (e) {
      toast({ title: "Gagal", description: String(e), variant: "destructive" });
    } finally {
      setBulkAssigning(false);
    }
  };

  const taxLabel = (id: number | null | undefined) => {
    if (!id) return "-";
    const t = (taxes ?? []).find((x) => x.id === id);
    return t ? `${t.name} (${t.rate}%)` : "-";
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Vendors</h1>
            <p className="text-sm text-muted-foreground">Kelola pemasok, supplier, dan vendor layanan pengiriman.</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-vendor">
                <Plus className="mr-2 h-4 w-4" /> New Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Vendor" : "Vendor Baru"}</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="bisnis">
                <TabsList className="w-full">
                  <TabsTrigger value="bisnis" className="flex-1">Informasi Bisnis</TabsTrigger>
                  <TabsTrigger value="layanan" className="flex-1">Layanan</TabsTrigger>
                  <TabsTrigger value="akses" className="flex-1">
                    <Building2 className="h-3.5 w-3.5 mr-1" />
                    Akses Company
                    {assignedCompanyIds.length > 0 && (
                      <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                        {assignedCompanyIds.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="bisnis" className="mt-3 grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Nama *</Label>
                    <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="input-vendor-name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="country">Negara</Label>
                      <Input id="country" value={form.country} onChange={(e) => set("country", e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="phone">Telepon</Label>
                      <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="contactPerson">PIC / Contact Person</Label>
                    <Input id="contactPerson" value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} placeholder="Nama penghubung" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Email Kontak</Label>
                    <Input id="email" type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="taxId">NPWP</Label>
                    <Input id="taxId" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder="cth. 01.234.567.8-901.000" data-testid="input-vendor-npwp" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="address">Alamat</Label>
                    <GooglePlacesAutocomplete
                      value={form.address}
                      onChange={(v) => set("address", v)}
                      placeholder="Ketik alamat vendor..."
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tarif Pajak Default (PPN Pembelian)</Label>
                    <Select
                      value={form.defaultPurchaseTaxId ? String(form.defaultPurchaseTaxId) : "none"}
                      onValueChange={(v) => set("defaultPurchaseTaxId", v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger data-testid="select-vendor-tax">
                        <SelectValue placeholder="Gunakan default global" />
                      </SelectTrigger>
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
                        const active = selectedServiceTypes.some(
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
                    {selectedServiceTypes.length === 0 && (
                      <p className="text-xs text-muted-foreground">Kosong = semua jenis layanan.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Ikon / Logo</Label>
                      <div className="flex items-center gap-2">
                        {form.logo && (
                          <div className="h-9 w-9 rounded border flex items-center justify-center bg-muted shrink-0">
                            <LogoDisplay logo={form.logo} />
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
                        {form.logo && form.logo !== "📦" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => set("logo", "📦")}
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
                      <Select value={form.eta || "__none__"} onValueChange={(v) => set("eta", v === "__none__" ? "" : v)}>
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
                      <Label htmlFor="fee">Tarif Dasar (Rp)</Label>
                      <Input id="fee" type="number" min="0" value={form.fee} onChange={(e) => set("fee", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="sortOrder">Urutan Tampil</Label>
                      <Input id="sortOrder" type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="note">Catatan</Label>
                    <Textarea id="note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Catatan tambahan untuk vendor ini" />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch id="isActive" checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                    <Label htmlFor="isActive">Aktif (tampil di portal & notifikasi)</Label>
                  </div>
                  <div className="border-t pt-3 mt-1 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Truk</p>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="hasInternalTruck"
                        checked={form.hasInternalTruck}
                        onCheckedChange={(v) => set("hasInternalTruck", v)}
                      />
                      <Label htmlFor="hasInternalTruck">Punya Truk Internal</Label>
                    </div>
                    {form.hasInternalTruck && (
                      <div className="grid gap-1.5">
                        <Label htmlFor="internalTruckPrice">Harga Truk Internal (Rp)</Label>
                        <Input
                          id="internalTruckPrice"
                          type="number"
                          min="0"
                          value={form.internalTruckPrice}
                          onChange={(e) => set("internalTruckPrice", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── Tab Akses Company ──────────────────────────────────── */}
                <TabsContent value="akses" className="mt-3">
                  <div className="rounded-lg border p-3 mb-3 bg-muted/40">
                    <div className="flex items-start gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Visibilitas Vendor</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Jika tidak ada company yang dipilih, vendor ini akan terlihat oleh <strong>semua divisi/company</strong> (global).
                          Pilih company tertentu untuk membatasi visibilitas hanya ke divisi tersebut.
                        </p>
                      </div>
                    </div>
                  </div>

                  {companies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Memuat daftar company…</p>
                  ) : (
                    <div className="grid gap-2">
                      {/* Select all / Clear */}
                      <div className="flex items-center justify-between pb-1 border-b">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {assignedCompanyIds.length === 0
                            ? "Semua company (global)"
                            : `${assignedCompanyIds.length} company dipilih`}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAssignedCompanyIds(companies.map((c) => c.id))}
                            className="text-xs text-primary hover:underline"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-muted-foreground text-xs">·</span>
                          <button
                            type="button"
                            onClick={() => setAssignedCompanyIds([])}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            Reset (Global)
                          </button>
                        </div>
                      </div>
                      {companies.map((company) => {
                        const checked = assignedCompanyIds.includes(company.id);
                        return (
                          <label
                            key={company.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              checked
                                ? "border-primary/50 bg-primary/5"
                                : "border-border hover:border-primary/30 hover:bg-muted/50"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleAssignedCompany(company.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight">{company.companyName}</p>
                              <p className="text-xs text-muted-foreground">{company.companyCode}</p>
                            </div>
                            {checked && (
                              <Badge className="bg-primary/10 text-primary border-0 text-xs shrink-0">Aktif</Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button
                  onClick={submit}
                  disabled={createMut.isPending || updateMut.isPending || savingAssignments}
                  data-testid="button-save-vendor"
                >
                  {(createMut.isPending || updateMut.isPending || savingAssignments) ? "Menyimpan..." : (editing ? "Simpan" : "Buat")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg flex-wrap">
            <span className="text-sm font-medium">{selectedIds.size} dipilih</span>
            <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Assign ke Company
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Assign {selectedIds.size} Vendor ke Company</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <Select value={bulkAssignCompanyId} onValueChange={setBulkAssignCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih company..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.companyName} ({c.companyCode})</SelectItem>
                      ))}
                      <SelectItem value="__unassign__">— Lepas (Global / tidak di-assign) —</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setBulkAssignOpen(false); setBulkAssignCompanyId(""); }}>Batal</Button>
                  <Button onClick={handleBulkAssignCompany} disabled={!bulkAssignCompanyId || bulkAssigning}>
                    {bulkAssigning ? "Menyimpan..." : "Simpan"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {bulkDeleting ? "Menghapus..." : "Hapus Terpilih"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Batal</Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Daftar Vendor</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={filterCompanyId} onValueChange={(v) => { setFilterCompanyId(v); setSelectedIds(new Set()); }}>
                  <SelectTrigger className="w-[200px] h-8 text-sm">
                    <SelectValue placeholder="Filter company..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Company</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.companyName} ({c.companyCode})</SelectItem>
                    ))}
                    <SelectItem value="__unassigned__">— Belum di-assign —</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    {allList.length > 0 && (
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Pilih semua" />
                    )}
                  </TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe Layanan</TableHead>
                  <TableHead>Negara</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead className="text-right">Tarif Dasar</TableHead>
                  <TableHead>Akses Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px] text-right sticky right-0 bg-card z-10">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allList.map((v) => {
                  const baseFee = Number(v.fee ?? 0);
                  const assignedIds = (v as { assignedCompanyIds?: number[] }).assignedCompanyIds ?? [];
                  return (
                    <TableRow key={v.id} data-testid={`row-vendor-${v.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(v.id)}
                          onCheckedChange={() => toggleSelect(v.id)}
                          aria-label={`Pilih ${v.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center"><LogoDisplay logo={v.logo} /></span>
                            <span className="font-medium">{v.name}</span>
                          </div>
                          {(v as { companyId?: number | null }).companyId != null && (() => {
                            const co = companies.find(c => c.id === (v as { companyId?: number | null }).companyId);
                            return co ? (
                              <Badge className="text-[10px] px-1.5 py-0 w-fit bg-indigo-100 text-indigo-800 hover:bg-indigo-100 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300">
                                {co.companyCode}
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {v.serviceType
                          ? <Badge variant="secondary" className="text-xs">{v.serviceType}</Badge>
                          : <span className="text-muted-foreground text-xs">Semua</span>}
                      </TableCell>
                      <TableCell>{v.country ?? "-"}</TableCell>
                      <TableCell>{v.phone ?? "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(v as { contactPerson?: string | null }).contactPerson ?? "-"}</TableCell>
                      <TableCell>{v.eta ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {baseFee > 0 ? `Rp ${baseFee.toLocaleString("id-ID")}` : "-"}
                      </TableCell>
                      <TableCell>
                        <CompanyAssignmentBadges assignedIds={assignedIds} companies={companies} />
                      </TableCell>
                      <TableCell>
                        {v.isActive
                          ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Aktif</Badge>
                          : <Badge variant="secondary" className="text-xs">Nonaktif</Badge>}
                      </TableCell>
                      <TableCell className="text-right sticky right-0 bg-card z-10">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => navigate(`/purchase/vendors/${v.id}`)}
                            title="Lihat Etalase"
                          >
                            <Store className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => startEdit(v)}
                            data-testid={`button-edit-vendor-${v.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => remove(v.id)}
                            data-testid={`button-delete-vendor-${v.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {allList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Belum ada vendor.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
