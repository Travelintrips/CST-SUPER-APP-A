import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Pencil, Trash2, FileText, ListChecks, LayoutList, Save, X,
} from "lucide-react";

/* ─── Types ─── */
interface CommodityField {
  id: number; templateId: number; fieldKey: string; label: string;
  fieldType: string; unit: string | null; required: boolean;
  options: string[] | null; sortOrder: number;
}
interface CommodityDoc {
  id: number; templateId: number; docName: string;
  description: string | null; required: boolean; sortOrder: number;
}
interface CommodityChecklist {
  id: number; templateId: number; item: string;
  category: string | null; sortOrder: number;
}
interface CommodityTemplateDetail {
  id: number; key: string; name: string; icon: string | null;
  description: string | null; sortOrder: number;
  fieldCount?: number; docCount?: number; checklistCount?: number;
  fields: CommodityField[];
  requiredDocs: CommodityDoc[];
  checklists: CommodityChecklist[];
}

/* ─── API helpers ─── */
const BASE = "/api/commodity-templates";

async function fetchDetail(id: string): Promise<CommodityTemplateDetail> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error("Gagal memuat detail template");
  return res.json();
}

async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { message?: string }).message ?? "Gagal"); }
  return res.json();
}
async function apiPut(url: string, body: unknown) {
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { message?: string }).message ?? "Gagal"); }
  return res.json();
}
async function apiDelete(url: string) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Gagal menghapus");
}

const FIELD_TYPES = ["text", "number", "select", "date", "boolean", "textarea"] as const;

/* ─── Inline editable field row ─── */
function FieldRow({ field, onSave, onDelete }: {
  field: CommodityField;
  onSave: (id: number, body: Partial<CommodityField>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [unit, setUnit] = useState(field.unit ?? "");
  const [required, setRequired] = useState(field.required);

  if (!editing) return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">{field.fieldKey}</TableCell>
      <TableCell className="font-medium">{field.label}</TableCell>
      <TableCell><Badge variant="secondary" className="text-xs">{field.fieldType}</Badge></TableCell>
      <TableCell className="text-sm">{field.unit ?? "—"}</TableCell>
      <TableCell>{field.required ? <Badge className="text-xs bg-red-100 text-red-700 hover:bg-red-100">Wajib</Badge> : <span className="text-muted-foreground text-xs">Opsional</span>}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(field.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <TableRow className="bg-muted/30">
      <TableCell><span className="font-mono text-xs text-muted-foreground">{field.fieldKey}</span></TableCell>
      <TableCell><Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 text-sm" /></TableCell>
      <TableCell><Badge variant="secondary" className="text-xs">{field.fieldType}</Badge></TableCell>
      <TableCell><Input value={unit} onChange={(e) => setUnit(e.target.value)} className="h-7 text-sm w-20" placeholder="—" /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={required} onCheckedChange={setRequired} />
          <span className="text-xs">{required ? "Wajib" : "Opsional"}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" className="h-7 px-2" onClick={() => { onSave(field.id, { label, unit: unit || null, required }); setEditing(false); }}><Save className="w-3 h-3 mr-1" />Simpan</Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ─── Inline editable doc row ─── */
function DocRow({ doc, onSave, onDelete }: {
  doc: CommodityDoc;
  onSave: (id: number, body: Partial<CommodityDoc>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [docName, setDocName] = useState(doc.docName);
  const [description, setDescription] = useState(doc.description ?? "");
  const [required, setRequired] = useState(doc.required);

  if (!editing) return (
    <TableRow>
      <TableCell className="font-medium">{doc.docName}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{doc.description ?? "—"}</TableCell>
      <TableCell>{doc.required ? <Badge className="text-xs bg-red-100 text-red-700 hover:bg-red-100">Wajib</Badge> : <Badge variant="secondary" className="text-xs">Opsional</Badge>}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(doc.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <TableRow className="bg-muted/30">
      <TableCell><Input value={docName} onChange={(e) => setDocName(e.target.value)} className="h-7 text-sm" /></TableCell>
      <TableCell><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-7 text-sm" placeholder="Deskripsi singkat" /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={required} onCheckedChange={setRequired} />
          <span className="text-xs">{required ? "Wajib" : "Opsional"}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" className="h-7 px-2" onClick={() => { onSave(doc.id, { docName, description: description || null, required }); setEditing(false); }}><Save className="w-3 h-3 mr-1" />Simpan</Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ─── Inline editable checklist row ─── */
function ChecklistRow({ cl, onSave, onDelete }: {
  cl: CommodityChecklist;
  onSave: (id: number, body: Partial<CommodityChecklist>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [item, setItem] = useState(cl.item);
  const [category, setCategory] = useState(cl.category ?? "");

  if (!editing) return (
    <TableRow>
      <TableCell className="font-medium text-sm">{cl.item}</TableCell>
      <TableCell>{cl.category ? <Badge variant="outline" className="text-xs">{cl.category}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(cl.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <TableRow className="bg-muted/30">
      <TableCell><Input value={item} onChange={(e) => setItem(e.target.value)} className="h-7 text-sm" /></TableCell>
      <TableCell><Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-7 text-sm w-32" placeholder="Kategori" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" className="h-7 px-2" onClick={() => { onSave(cl.id, { item, category: category || null }); setEditing(false); }}><Save className="w-3 h-3 mr-1" />Simpan</Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ─── Main Page ─── */
export default function ProductTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const QUERY_KEY = ["commodity-template", id];

  /* Add dialogs */
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addChecklistOpen, setAddChecklistOpen] = useState(false);

  const [fieldForm, setFieldForm] = useState({ fieldKey: "", label: "", fieldType: "text", unit: "", required: false, options: "" });
  const [docForm, setDocForm] = useState({ docName: "", description: "", required: true });
  const [checklistForm, setChecklistForm] = useState({ item: "", category: "" });

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchDetail(id!),
    enabled: !!id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  /* Field mutations */
  const addFieldMut = useMutation({
    mutationFn: (body: unknown) => apiPost(`${BASE}/${id}/fields`, body),
    onSuccess: () => { invalidate(); setAddFieldOpen(false); setFieldForm({ fieldKey: "", label: "", fieldType: "text", unit: "", required: false, options: "" }); toast({ title: "Field ditambahkan" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });
  const updateFieldMut = useMutation({
    mutationFn: ({ fieldId, body }: { fieldId: number; body: unknown }) => apiPut(`${BASE}/fields/${fieldId}`, body),
    onSuccess: () => { invalidate(); toast({ title: "Field diperbarui" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });
  const deleteFieldMut = useMutation({
    mutationFn: (fieldId: number) => apiDelete(`${BASE}/fields/${fieldId}`),
    onSuccess: () => { invalidate(); toast({ title: "Field dihapus" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });

  /* Doc mutations */
  const addDocMut = useMutation({
    mutationFn: (body: unknown) => apiPost(`${BASE}/${id}/docs`, body),
    onSuccess: () => { invalidate(); setAddDocOpen(false); setDocForm({ docName: "", description: "", required: true }); toast({ title: "Dokumen ditambahkan" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });
  const updateDocMut = useMutation({
    mutationFn: ({ docId, body }: { docId: number; body: unknown }) => apiPut(`${BASE}/docs/${docId}`, body),
    onSuccess: () => { invalidate(); toast({ title: "Dokumen diperbarui" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });
  const deleteDocMut = useMutation({
    mutationFn: (docId: number) => apiDelete(`${BASE}/docs/${docId}`),
    onSuccess: () => { invalidate(); toast({ title: "Dokumen dihapus" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });

  /* Checklist mutations */
  const addChecklistMut = useMutation({
    mutationFn: (body: unknown) => apiPost(`${BASE}/${id}/checklists`, body),
    onSuccess: () => { invalidate(); setAddChecklistOpen(false); setChecklistForm({ item: "", category: "" }); toast({ title: "Checklist ditambahkan" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });
  const updateChecklistMut = useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: unknown }) => apiPut(`${BASE}/checklists/${itemId}`, body),
    onSuccess: () => { invalidate(); toast({ title: "Checklist diperbarui" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });
  const deleteChecklistMut = useMutation({
    mutationFn: (itemId: number) => apiDelete(`${BASE}/checklists/${itemId}`),
    onSuccess: () => { invalidate(); toast({ title: "Checklist dihapus" }); },
    onError: (e) => toast({ title: "Gagal", description: String(e), variant: "destructive" }),
  });

  const handleAddField = () => {
    if (!fieldForm.fieldKey || !fieldForm.label) { toast({ title: "Field Key dan Label wajib diisi", variant: "destructive" }); return; }
    const opts = fieldForm.options.trim() ? fieldForm.options.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    addFieldMut.mutate({ fieldKey: fieldForm.fieldKey, label: fieldForm.label, fieldType: fieldForm.fieldType, unit: fieldForm.unit || undefined, required: fieldForm.required, options: opts });
  };

  const handleAddDoc = () => {
    if (!docForm.docName) { toast({ title: "Nama dokumen wajib diisi", variant: "destructive" }); return; }
    addDocMut.mutate({ docName: docForm.docName, description: docForm.description || undefined, required: docForm.required });
  };

  const handleAddChecklist = () => {
    if (!checklistForm.item) { toast({ title: "Item checklist wajib diisi", variant: "destructive" }); return; }
    addChecklistMut.mutate({ item: checklistForm.item, category: checklistForm.category || undefined });
  };

  if (isLoading) return (
    <AppShell>
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    </AppShell>
  );

  if (error || !data) return (
    <AppShell>
      <div className="p-6 text-center text-muted-foreground">
        Template tidak ditemukan.{" "}
        <Link href="/product-templates" className="text-primary underline">Kembali</Link>
      </div>
    </AppShell>
  );

  /* Group checklists by category */
  const checklistByCategory = data.checklists.reduce<Record<string, CommodityChecklist[]>>((acc, cl) => {
    const key = cl.category ?? "Umum";
    if (!acc[key]) acc[key] = [];
    acc[key].push(cl);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/product-templates">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Kembali
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{data.icon ?? "📦"}</span>
            <div>
              <h1 className="text-xl font-semibold">{data.name}</h1>
              <span className="text-xs font-mono text-muted-foreground">{data.key}</span>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Custom Fields", value: data.fields.length, color: "text-blue-600 bg-blue-50", Icon: LayoutList },
            { label: "Dokumen Wajib", value: data.requiredDocs.length, color: "text-orange-600 bg-orange-50", Icon: FileText },
            { label: "Checklist", value: data.checklists.length, color: "text-green-600 bg-green-50", Icon: ListChecks },
          ].map(({ label, value, color, Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color.split(" ")[1]}`}>
                  <Icon className={`w-5 h-5 ${color.split(" ")[0]}`} />
                </div>
                <div>
                  <div className={`text-2xl font-bold ${color.split(" ")[0]}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="fields">
          <TabsList>
            <TabsTrigger value="fields" className="gap-1.5">
              <LayoutList className="w-3.5 h-3.5" />
              Custom Fields ({data.fields.length})
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Dok Wajib ({data.requiredDocs.length})
            </TabsTrigger>
            <TabsTrigger value="checklist" className="gap-1.5">
              <ListChecks className="w-3.5 h-3.5" />
              Checklist ({data.checklists.length})
            </TabsTrigger>
          </TabsList>

          {/* ── FIELDS TAB ── */}
          <TabsContent value="fields">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base">Custom Fields</CardTitle>
                <Button size="sm" className="gap-1.5" onClick={() => setAddFieldOpen(true)}>
                  <Plus className="w-4 h-4" />Tambah Field
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.fields.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada field. Tambah sekarang.</TableCell></TableRow>
                    )}
                    {data.fields.map((f) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        onSave={(fieldId, body) => updateFieldMut.mutate({ fieldId, body })}
                        onDelete={(fieldId) => deleteFieldMut.mutate(fieldId)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DOCS TAB ── */}
          <TabsContent value="docs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base">Dokumen Wajib</CardTitle>
                <Button size="sm" className="gap-1.5" onClick={() => setAddDocOpen(true)}>
                  <Plus className="w-4 h-4" />Tambah Dokumen
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Dokumen</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.requiredDocs.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Belum ada dokumen wajib.</TableCell></TableRow>
                    )}
                    {data.requiredDocs.map((d) => (
                      <DocRow
                        key={d.id}
                        doc={d}
                        onSave={(docId, body) => updateDocMut.mutate({ docId, body })}
                        onDelete={(docId) => deleteDocMut.mutate(docId)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CHECKLIST TAB ── */}
          <TabsContent value="checklist">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base">Checklist Operasional</CardTitle>
                <Button size="sm" className="gap-1.5" onClick={() => setAddChecklistOpen(true)}>
                  <Plus className="w-4 h-4" />Tambah Item
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {data.checklists.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">Belum ada item checklist.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.checklists.map((cl) => (
                        <ChecklistRow
                          key={cl.id}
                          cl={cl}
                          onSave={(itemId, body) => updateChecklistMut.mutate({ itemId, body })}
                          onDelete={(itemId) => deleteChecklistMut.mutate(itemId)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Category summary */}
            {Object.keys(checklistByCategory).length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(checklistByCategory).map(([cat, items]) => (
                  <Badge key={cat} variant="outline" className="gap-1">
                    {cat} <span className="text-primary font-bold">{items.length}</span>
                  </Badge>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Add Field Dialog ─── */}
      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Custom Field</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field Key</Label>
                <Input placeholder="cth. calorific_value" value={fieldForm.fieldKey}
                  onChange={(e) => setFieldForm((f) => ({ ...f, fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipe</Label>
                <Select value={fieldForm.fieldType} onValueChange={(v) => setFieldForm((f) => ({ ...f, fieldType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input placeholder="cth. Calorific Value (kcal/kg)" value={fieldForm.label}
                onChange={(e) => setFieldForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Satuan (opsional)</Label>
                <Input placeholder="cth. %, MPa, mm" value={fieldForm.unit}
                  onChange={(e) => setFieldForm((f) => ({ ...f, unit: e.target.value }))} />
              </div>
              <div className="space-y-1.5 flex items-end gap-2 pb-1">
                <Switch checked={fieldForm.required} onCheckedChange={(v) => setFieldForm((f) => ({ ...f, required: v }))} />
                <Label className="text-sm">{fieldForm.required ? "Wajib" : "Opsional"}</Label>
              </div>
            </div>
            {fieldForm.fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>Opsi (pisahkan dengan koma)</Label>
                <Input placeholder="cth. Arabika, Robusta, Liberika" value={fieldForm.options}
                  onChange={(e) => setFieldForm((f) => ({ ...f, options: e.target.value }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldOpen(false)}>Batal</Button>
            <Button onClick={handleAddField} disabled={addFieldMut.isPending}>{addFieldMut.isPending ? "Menyimpan..." : "Tambah"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Doc Dialog ─── */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Dokumen Wajib</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nama Dokumen</Label>
              <Input placeholder="cth. Certificate of Analysis (COA)" value={docForm.docName}
                onChange={(e) => setDocForm((f) => ({ ...f, docName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi (opsional)</Label>
              <Textarea placeholder="Penjelasan singkat dokumen..." rows={2} value={docForm.description}
                onChange={(e) => setDocForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={docForm.required} onCheckedChange={(v) => setDocForm((f) => ({ ...f, required: v }))} />
              <Label>{docForm.required ? "Wajib dilampirkan" : "Opsional"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDocOpen(false)}>Batal</Button>
            <Button onClick={handleAddDoc} disabled={addDocMut.isPending}>{addDocMut.isPending ? "Menyimpan..." : "Tambah"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Checklist Dialog ─── */}
      <Dialog open={addChecklistOpen} onOpenChange={setAddChecklistOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Item Checklist</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Item Checklist</Label>
              <Input placeholder="cth. Verifikasi kadar air sesuai standar" value={checklistForm.item}
                onChange={(e) => setChecklistForm((f) => ({ ...f, item: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori (opsional)</Label>
              <Input placeholder="cth. Kualitas, Regulasi, Logistik, Kemasan" value={checklistForm.category}
                onChange={(e) => setChecklistForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChecklistOpen(false)}>Batal</Button>
            <Button onClick={handleAddChecklist} disabled={addChecklistMut.isPending}>{addChecklistMut.isPending ? "Menyimpan..." : "Tambah"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
