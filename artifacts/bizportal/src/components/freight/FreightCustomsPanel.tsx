import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  FileScan,
  Plus,
  Loader2,
  Upload,
  CheckCircle,
  AlertCircle,
  Pencil,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomsDocType = "PIB" | "PEB" | "SPPB" | "NPE" | "BC23" | "PP" | "SPTNP" | "other";

const DOC_TYPE_LABELS: Record<CustomsDocType, string> = {
  PIB: "PIB — Pemberitahuan Impor Barang",
  PEB: "PEB — Pemberitahuan Ekspor Barang",
  SPPB: "SPPB — Surat Persetujuan Pengeluaran Barang",
  NPE: "NPE — Nota Pelayanan Ekspor",
  BC23: "BC 2.3 — Dokumen TPB",
  PP: "PP — Pemberitahuan Pabean",
  SPTNP: "SPTNP — Surat Pemberitahuan Tarif Nilai Pabean",
  other: "Dokumen Lainnya",
};

const DOC_TYPE_BADGE_COLOR: Record<CustomsDocType, string> = {
  PIB: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PEB: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  SPPB: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  NPE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  BC23: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  PP: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  SPTNP: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  other: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-300",
};

interface CustomsDoc {
  id: number;
  shipmentId: number;
  docType: string;
  nomorAju: string | null;
  nomorDokumen: string | null;
  tanggalDokumen: string | null;
  data: Record<string, unknown>;
  scanSource: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Field definitions per doc type ──────────────────────────────────────────

type FieldDef = { key: string; label: string; type?: "number" | "text" | "textarea"; prefix?: string };

const COMMON_FIELDS: FieldDef[] = [
  { key: "namaPerusahaan", label: "Nama Perusahaan / Importir / Eksportir" },
  { key: "npwpPerusahaan", label: "NPWP" },
  { key: "kantorPabean", label: "Kantor Pabean" },
  { key: "posHS", label: "Pos HS / HS Code" },
  { key: "uraianBarang", label: "Uraian Barang", type: "textarea" },
  { key: "jumlahKoli", label: "Jumlah Koli", type: "number" },
  { key: "beratBersih", label: "Berat Bersih (kg)", type: "number" },
  { key: "beratKotor", label: "Berat Kotor (kg)", type: "number" },
];

const DOC_EXTRA_FIELDS: Partial<Record<CustomsDocType, FieldDef[]>> = {
  PIB: [
    { key: "negaraAsal", label: "Negara Asal" },
    { key: "pelabuhan", label: "Pelabuhan Bongkar" },
    { key: "nilaiPabean", label: "Nilai Pabean (CIF) — IDR", type: "number" },
    { key: "beaMasuk", label: "Bea Masuk (BM) — IDR", type: "number" },
    { key: "ppnImpor", label: "PPN Impor — IDR", type: "number" },
    { key: "pphImpor", label: "PPh Impor — IDR", type: "number" },
    { key: "totalTagihan", label: "Total Tagihan — IDR", type: "number" },
    { key: "keteranganTambahan", label: "Keterangan Tambahan", type: "textarea" },
  ],
  PEB: [
    { key: "negaraTujuan", label: "Negara Tujuan Ekspor" },
    { key: "pelabuhan", label: "Pelabuhan Muat" },
    { key: "nilaiEkspor", label: "Nilai FOB Ekspor — USD", type: "number" },
    { key: "keteranganTambahan", label: "Keterangan Tambahan", type: "textarea" },
  ],
  SPPB: [
    { key: "nomorPIBTerkait", label: "Nomor PIB Terkait" },
    { key: "keteranganTambahan", label: "Keterangan Tambahan", type: "textarea" },
  ],
  NPE: [
    { key: "nomorPEBTerkait", label: "Nomor PEB Terkait" },
    { key: "nilaiEkspor", label: "Nilai FOB — USD", type: "number" },
    { key: "keteranganTambahan", label: "Keterangan Tambahan", type: "textarea" },
  ],
  BC23: [
    { key: "keteranganTambahan", label: "Keterangan / Jenis Fasilitas", type: "textarea" },
  ],
};

function getFieldsForDocType(docType: string): FieldDef[] {
  const extra = DOC_EXTRA_FIELDS[docType as CustomsDocType] ?? [
    { key: "keteranganTambahan", label: "Keterangan Tambahan", type: "textarea" },
  ];
  return [...COMMON_FIELDS, ...extra];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function customsDocsKey(shipmentId: number) {
  return ["freight-customs-docs", shipmentId];
}

// ─── Empty form state ─────────────────────────────────────────────────────────

function emptyForm(): Omit<CustomsDoc, "id" | "shipmentId" | "createdAt" | "updatedAt"> {
  return {
    docType: "PIB",
    nomorAju: "",
    nomorDokumen: "",
    tanggalDokumen: "",
    data: {},
    scanSource: "manual",
    notes: "",
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  shipmentId: number;
}

export function FreightCustomsPanel({ shipmentId }: Props) {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const { data: docs = [], isLoading } = useQuery<CustomsDoc[]>({
    queryKey: customsDocsKey(shipmentId),
    queryFn: () => apiFetch(`/api/logistics/freight-shipments/${shipmentId}/customs-docs`),
    enabled: !!shipmentId,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/api/logistics/freight-shipments/${shipmentId}/customs-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customsDocsKey(shipmentId) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/api/logistics/freight-shipments/${shipmentId}/customs-docs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customsDocsKey(shipmentId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/logistics/freight-shipments/${shipmentId}/customs-docs/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customsDocsKey(shipmentId) });
    },
  });

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<CustomsDoc | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(form: ReturnType<typeof emptyForm>, docId?: number) {
    const payload = {
      docType: form.docType,
      nomorAju: form.nomorAju || null,
      nomorDokumen: form.nomorDokumen || null,
      tanggalDokumen: form.tanggalDokumen || null,
      data: form.data ?? {},
      scanSource: form.scanSource || "manual",
      notes: form.notes || null,
    };

    try {
      if (docId) {
        await updateMutation.mutateAsync({ id: docId, body: payload });
        toast.success("Dokumen kepabeanan diperbarui");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Dokumen kepabeanan ditambahkan");
      }
      setAddDialogOpen(false);
      setEditDoc(null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Gagal menyimpan dokumen");
    }
  }

  async function handleDelete() {
    if (!deleteDocId) return;
    try {
      await deleteMutation.mutateAsync(deleteDocId);
      toast.success("Dokumen dihapus");
    } catch {
      toast.error("Gagal menghapus dokumen");
    } finally {
      setDeleteDocId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Dokumen Kepabeanan</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            PIB, PEB, SPPB, NPE, dan dokumen bea cukai lainnya
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Tambah Dokumen
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Memuat dokumen kepabeanan...
        </div>
      )}

      {!isLoading && docs.length === 0 && (
        <div className="border border-dashed rounded-lg py-8 text-center text-sm text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Belum ada dokumen kepabeanan</p>
          <p className="text-xs mt-1">Tambahkan PIB, PEB, SPPB, atau dokumen lainnya</p>
        </div>
      )}

      <div className="space-y-2">
        {docs.map((doc) => (
          <CustomsDocCard
            key={doc.id}
            doc={doc}
            expanded={expandedIds.has(doc.id)}
            onToggle={() => toggleExpand(doc.id)}
            onEdit={() => setEditDoc(doc)}
            onDelete={() => setDeleteDocId(doc.id)}
          />
        ))}
      </div>

      {/* Add Dialog */}
      <CustomsDocFormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSave={handleSave}
        getToken={getToken}
        isSaving={createMutation.isPending}
      />

      {/* Edit Dialog */}
      {editDoc && (
        <CustomsDocFormDialog
          open={!!editDoc}
          onOpenChange={(open) => { if (!open) setEditDoc(null); }}
          initialDoc={editDoc}
          onSave={(form) => handleSave(form, editDoc.id)}
          getToken={getToken}
          isSaving={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDocId} onOpenChange={(o) => { if (!o) setDeleteDocId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Data dokumen kepabeanan akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Customs Doc Card ─────────────────────────────────────────────────────────

function CustomsDocCard({
  doc,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  doc: CustomsDoc;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fields = getFieldsForDocType(doc.docType);
  const badgeClass = DOC_TYPE_BADGE_COLOR[doc.docType as CustomsDocType] ?? DOC_TYPE_BADGE_COLOR.other;
  const docTypeLabel = DOC_TYPE_LABELS[doc.docType as CustomsDocType] ?? doc.docType;

  const dataEntries = fields
    .map((f) => ({ ...f, value: doc.data?.[f.key] as string | number | null | undefined }))
    .filter((f) => f.value !== null && f.value !== undefined && f.value !== "");

  const idrFields = new Set(["nilaiPabean", "beaMasuk", "ppnImpor", "pphImpor", "totalTagihan"]);
  const usdFields = new Set(["nilaiEkspor"]);

  function formatVal(key: string, val: unknown) {
    if (typeof val !== "number") return String(val);
    if (idrFields.has(key)) return `IDR ${val.toLocaleString("id-ID")}`;
    if (usdFields.has(key)) return `USD ${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    return val.toLocaleString("id-ID");
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <button className="flex-1 text-left" onClick={onToggle}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                {doc.docType}
              </span>
              {doc.scanSource === "ai_scan" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  AI Scan
                </span>
              )}
              {doc.nomorDokumen && (
                <span className="font-mono text-sm font-medium">{doc.nomorDokumen}</span>
              )}
              {doc.nomorAju && (
                <span className="text-xs text-muted-foreground">Aju: {doc.nomorAju}</span>
              )}
              {doc.tanggalDokumen && (
                <span className="text-xs text-muted-foreground">{doc.tanggalDokumen}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">{docTypeLabel}</p>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pb-4 pt-0 px-4 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-3">
            {dataEntries.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-2">Tidak ada data tambahan</p>
            )}
            {dataEntries.map((f) => (
              <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-sm font-medium break-words">{formatVal(f.key, f.value)}</p>
              </div>
            ))}
          </div>
          {doc.notes && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p className="text-sm whitespace-pre-wrap">{doc.notes}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Dibuat {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true, locale: idLocale })}
            {doc.updatedAt !== doc.createdAt && (
              <> · diperbarui {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true, locale: idLocale })}</>
            )}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Form Dialog ──────────────────────────────────────────────────────────────

type ScanState =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDoc?: CustomsDoc;
  onSave: (form: ReturnType<typeof emptyForm>) => void;
  getToken: () => Promise<string | null>;
  isSaving: boolean;
}

function CustomsDocFormDialog({ open, onOpenChange, initialDoc, onSave, getToken, isSaving }: FormDialogProps) {
  const [mode, setMode] = useState<"form" | "scan">(initialDoc ? "form" : "form");
  const [scanState, setScanState] = useState<ScanState>({ kind: "idle" });

  function buildInitialForm() {
    if (!initialDoc) return emptyForm();
    return {
      docType: initialDoc.docType,
      nomorAju: initialDoc.nomorAju ?? "",
      nomorDokumen: initialDoc.nomorDokumen ?? "",
      tanggalDokumen: initialDoc.tanggalDokumen ?? "",
      data: { ...(initialDoc.data ?? {}) },
      scanSource: initialDoc.scanSource ?? "manual",
      notes: initialDoc.notes ?? "",
    };
  }

  const [form, setForm] = useState(buildInitialForm);

  // Reset form when dialog opens with different doc
  const [lastDocId, setLastDocId] = useState<number | undefined>(initialDoc?.id);
  if (initialDoc?.id !== lastDocId) {
    setLastDocId(initialDoc?.id);
    setForm(buildInitialForm());
    setMode("form");
    setScanState({ kind: "idle" });
  }

  const fields = getFieldsForDocType(form.docType);

  function setDataField(key: string, value: string | number | null) {
    setForm((prev) => ({ ...prev, data: { ...prev.data, [key]: value === "" ? null : value } }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleScan(file);
    e.target.value = "";
  }

  const handleScan = useCallback(async (file: File) => {
    setScanState({ kind: "uploading", fileName: file.name });
    setMode("form");
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/scan-document", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const result = await resp.json();

      if (result.docType !== "customs") {
        toast.warning("Dokumen yang di-scan bukan dokumen kepabeanan. Data tidak dapat diekstrak otomatis.");
        setScanState({ kind: "error", message: "Bukan dokumen kepabeanan" });
        return;
      }

      const { customsDocType, nomorAju, nomorDokumen, tanggalDokumen, ...rest } = result;
      const docType: CustomsDocType = (customsDocType && customsDocType in DOC_TYPE_LABELS)
        ? customsDocType
        : "other";

      const newData: Record<string, unknown> = {};
      const dataKeys = [
        "namaPerusahaan", "npwpPerusahaan", "kantorPabean", "posHS", "uraianBarang",
        "jumlahKoli", "beratBersih", "beratKotor", "negaraAsal", "negaraTujuan", "pelabuhan",
        "nilaiPabean", "beaMasuk", "ppnImpor", "pphImpor", "totalTagihan", "nilaiEkspor",
        "nomorPIBTerkait", "nomorPEBTerkait", "keteranganTambahan",
      ];
      for (const key of dataKeys) {
        if (rest[key] !== null && rest[key] !== undefined) newData[key] = rest[key];
      }

      setForm((prev) => ({
        ...prev,
        docType,
        nomorAju: nomorAju ?? prev.nomorAju,
        nomorDokumen: nomorDokumen ?? prev.nomorDokumen,
        tanggalDokumen: tanggalDokumen ?? prev.tanggalDokumen,
        data: newData,
        scanSource: "ai_scan",
      }));
      setScanState({ kind: "done" });
      toast.success(`Dokumen ${docType} berhasil di-scan — periksa dan simpan data`);
    } catch (e: unknown) {
      setScanState({ kind: "error", message: (e as Error).message });
      toast.error("Gagal scan dokumen: " + (e as Error).message);
    }
  }, [getToken]);

  const isEdit = !!initialDoc;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Dokumen Kepabeanan" : "Tambah Dokumen Kepabeanan"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Scan CTA (only when adding) */}
          {!isEdit && (
            <div className="relative border border-dashed rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileScan className="w-6 h-6 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Scan Dokumen dengan AI</p>
                    <p className="text-xs text-muted-foreground">
                      Upload PDF atau foto dokumen, AI akan mengekstrak data otomatis
                    </p>
                  </div>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={scanState.kind === "uploading"}
                  />
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span className="gap-1.5">
                      {scanState.kind === "uploading" ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                      ) : (
                        <><Upload className="w-4 h-4" /> Pilih File</>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
              {scanState.kind === "uploading" && (
                <p className="text-xs text-muted-foreground mt-2">
                  Memproses {(scanState as { kind: "uploading"; fileName: string }).fileName}… PDF teks ±5–10 dtk · foto ±30–60 dtk
                </p>
              )}
              {scanState.kind === "done" && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Data berhasil diekstrak — silakan periksa form di bawah
                </div>
              )}
              {scanState.kind === "error" && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {(scanState as { kind: "error"; message: string }).message}
                </div>
              )}
            </div>
          )}

          {/* Doc Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Jenis Dokumen *</Label>
              <Select
                value={form.docType}
                onValueChange={(v) => setForm((p) => ({ ...p, docType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tanggal Dokumen</Label>
              <Input
                type="date"
                value={form.tanggalDokumen ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, tanggalDokumen: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nomor Aju</Label>
              <Input
                placeholder="cth. 000001/ABC/2024"
                value={form.nomorAju ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, nomorAju: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nomor {form.docType}</Label>
              <Input
                placeholder="Nomor dokumen resmi"
                value={form.nomorDokumen ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, nomorDokumen: e.target.value }))}
              />
            </div>
          </div>

          {/* Dynamic fields based on doc type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((field) => {
              const val = (form.data[field.key] as string | number | null | undefined) ?? "";
              if (field.type === "textarea") {
                return (
                  <div key={field.key} className="col-span-2 space-y-1.5">
                    <Label>{field.label}</Label>
                    <Textarea
                      rows={3}
                      value={String(val)}
                      onChange={(e) => setDataField(field.key, e.target.value)}
                    />
                  </div>
                );
              }
              return (
                <div key={field.key} className="space-y-1.5">
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(val)}
                    onChange={(e) =>
                      setDataField(
                        field.key,
                        field.type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Catatan Internal</Label>
            <Textarea
              rows={2}
              placeholder="Catatan tambahan (opsional)"
              value={form.notes ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => onSave(form)} disabled={isSaving || !form.docType}>
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Menyimpan...</> : "Simpan Dokumen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
