import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, ArrowLeft, Eye, RefreshCcw, FileText, Building2 } from "lucide-react";
import { Link } from "wouter";

const API = "/api/settings/documents";

const DOCUMENT_TYPES = [
  { key: "invoice",       label: "Invoice",                icon: "🧾" },
  { key: "quotation",     label: "Penawaran / Quotation",  icon: "📋" },
  { key: "po",            label: "Purchase Order",         icon: "🛒" },
  { key: "delivery_note", label: "Surat Jalan",            icon: "🚚" },
  { key: "packing_list",  label: "Packing List",           icon: "📦" },
  { key: "mou",           label: "MOU",                    icon: "🤝" },
  { key: "kontrak",       label: "Kontrak",                icon: "📜" },
  { key: "nda",           label: "NDA",                    icon: "🔒" },
  { key: "sla",           label: "SLA",                    icon: "📊" },
];

const BUSINESS_LINES = [
  "Logistic/Forwarder", "Export/Import", "PPJK", "Trading",
  "Sport Center", "POS", "Legal",
];

interface TemplateConfig {
  documentType: string;
  businessLine: string;
  logoUrl: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  headerText: string;
  footerText: string;
  primaryColor: string;
  accentColor: string;
  fontSize: number;
  defaultTerms: string;
  defaultNotes: string;
  dueDays: number;
  showTax: boolean;
  showSignature: boolean;
  showStamp: boolean;
  templateFormat: "pdf" | "html";
  updatedAt?: string;
}

const DEFAULT: Omit<TemplateConfig, "documentType"> = {
  businessLine: "Logistic/Forwarder",
  logoUrl: "",
  companyName: "PT CST Logistik Indonesia",
  companyAddress: "Jl. Logistik No. 1, Jakarta",
  companyPhone: "+62 21 1234 5678",
  companyEmail: "info@cstlogistik.com",
  headerText: "",
  footerText: "Terima kasih atas kepercayaan Anda.",
  primaryColor: "#1e40af",
  accentColor: "#3b82f6",
  fontSize: 11,
  defaultTerms: "",
  defaultNotes: "",
  dueDays: 14,
  showTax: true,
  showSignature: true,
  showStamp: false,
  templateFormat: "pdf",
};

export default function DocumentTemplatesPage() {
  const { toast } = useToast();
  const [activeType, setActiveType] = useState("invoice");
  const [templates, setTemplates] = useState<Record<string, TemplateConfig>>({});
  const [draft, setDraft] = useState<TemplateConfig>({ ...DEFAULT, documentType: "invoice" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const res = await fetch(API, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat template");
      const data: TemplateConfig[] = await res.json();
      const map: Record<string, TemplateConfig> = {};
      data.forEach((t) => { map[t.documentType] = t; });
      setTemplates(map);
      const current = map["invoice"] ?? { ...DEFAULT, documentType: "invoice" };
      setDraft(current);
    } catch {
      toast({ title: "Gagal memuat template", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function switchType(type: string) {
    setActiveType(type);
    const saved = templates[type] ?? { ...DEFAULT, documentType: type };
    setDraft(saved);
    setDirty(false);
    setPreviewHtml(null);
  }

  function patch<K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/${activeType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      const { template } = await res.json();
      setTemplates((prev) => ({ ...prev, [activeType]: template }));
      setDraft(template);
      setDirty(false);
      toast({ title: "Template tersimpan", description: `Template ${activeType} berhasil diperbarui.` });
    } catch {
      toast({ title: "Gagal menyimpan template", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    setPreviewHtml(null);
    try {
      const res = await fetch(`${API}/${activeType}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Gagal generate preview");
      const html = await res.text();
      setPreviewHtml(html);
      setTimeout(() => {
        if (iframeRef.current) {
          const doc = iframeRef.current.contentDocument;
          if (doc) { doc.open(); doc.write(html); doc.close(); }
        }
      }, 50);
    } catch {
      toast({ title: "Gagal generate preview", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  }

  const meta = DOCUMENT_TYPES.find((d) => d.key === activeType);
  const isLegal = ["mou", "kontrak", "nda", "sla"].includes(activeType);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Template Dokumen</h1>
            <p className="text-muted-foreground text-sm">Konfigurasi desain & branding untuk semua dokumen bisnis dan legal</p>
          </div>
        </div>

        <div className="flex gap-6">
          <div className="w-52 shrink-0">
            <nav className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-1">Bisnis</p>
              {DOCUMENT_TYPES.filter((d) => !["mou","kontrak","nda","sla"].includes(d.key)).map((d) => (
                <button
                  key={d.key}
                  onClick={() => switchType(d.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                    activeType === d.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="text-base">{d.icon}</span>
                  <span>{d.label}</span>
                  {templates[d.key]?.updatedAt && activeType !== d.key && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mt-3 mb-1">Legal</p>
              {DOCUMENT_TYPES.filter((d) => ["mou","kontrak","nda","sla"].includes(d.key)).map((d) => (
                <button
                  key={d.key}
                  onClick={() => switchType(d.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                    activeType === d.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="text-base">{d.icon}</span>
                  <span>{d.label}</span>
                  {templates[d.key]?.updatedAt && activeType !== d.key && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{meta?.icon}</span>
                      <div>
                        <CardTitle className="text-base">{meta?.label}</CardTitle>
                        <CardDescription className="text-xs">
                          {draft.updatedAt
                            ? `Terakhir diperbarui: ${new Date(draft.updatedAt).toLocaleString("id-ID")}`
                            : "Belum pernah disimpan"}
                        </CardDescription>
                      </div>
                    </div>
                    {dirty && <Badge variant="outline" className="text-orange-600 border-orange-300">Belum disimpan</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="branding">
                    <TabsList className="w-full mb-4">
                      <TabsTrigger value="branding" className="flex-1">Branding</TabsTrigger>
                      <TabsTrigger value="konten" className="flex-1">Konten</TabsTrigger>
                      <TabsTrigger value="tampilan" className="flex-1">Tampilan</TabsTrigger>
                      <TabsTrigger value="opsi" className="flex-1">Opsi</TabsTrigger>
                    </TabsList>

                    <TabsContent value="branding" className="space-y-4">
                      <div className="space-y-2">
                        <Label>Business Line</Label>
                        <Select value={draft.businessLine} onValueChange={(v) => patch("businessLine", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BUSINESS_LINES.map((b) => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>URL Logo</Label>
                        <Input
                          placeholder="https://example.com/logo.png"
                          value={draft.logoUrl}
                          onChange={(e) => patch("logoUrl", e.target.value)}
                        />
                        {draft.logoUrl && (
                          <div className="border rounded p-2 bg-muted/30 flex items-center justify-center h-20">
                            <img src={draft.logoUrl} alt="Logo" className="max-h-16 max-w-40 object-contain" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Nama Perusahaan</Label>
                        <Input value={draft.companyName} onChange={(e) => patch("companyName", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Alamat</Label>
                        <Textarea rows={2} value={draft.companyAddress} onChange={(e) => patch("companyAddress", e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>No. Telepon</Label>
                          <Input value={draft.companyPhone} onChange={(e) => patch("companyPhone", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input value={draft.companyEmail} onChange={(e) => patch("companyEmail", e.target.value)} />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="konten" className="space-y-4">
                      <div className="space-y-2">
                        <Label>Teks Header (opsional)</Label>
                        <Textarea
                          rows={2}
                          placeholder="Teks tambahan di bawah header perusahaan..."
                          value={draft.headerText}
                          onChange={(e) => patch("headerText", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Syarat & Ketentuan Default</Label>
                        <Textarea
                          rows={3}
                          placeholder="Mis: Pembayaran dalam 14 hari kerja..."
                          value={draft.defaultTerms}
                          onChange={(e) => patch("defaultTerms", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Catatan Default</Label>
                        <Textarea
                          rows={2}
                          placeholder="Catatan bawaan di setiap dokumen..."
                          value={draft.defaultNotes}
                          onChange={(e) => patch("defaultNotes", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Teks Footer</Label>
                        <Input
                          value={draft.footerText}
                          onChange={(e) => patch("footerText", e.target.value)}
                        />
                      </div>
                      {!isLegal && (
                        <div className="space-y-2">
                          <Label>Jatuh Tempo Default (hari)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={draft.dueDays}
                            onChange={(e) => patch("dueDays", parseInt(e.target.value) || 14)}
                          />
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="tampilan" className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Warna Utama</Label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="color"
                              value={draft.primaryColor}
                              onChange={(e) => patch("primaryColor", e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border"
                            />
                            <Input
                              value={draft.primaryColor}
                              onChange={(e) => patch("primaryColor", e.target.value)}
                              className="font-mono text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Warna Aksen</Label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="color"
                              value={draft.accentColor}
                              onChange={(e) => patch("accentColor", e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border"
                            />
                            <Input
                              value={draft.accentColor}
                              onChange={(e) => patch("accentColor", e.target.value)}
                              className="font-mono text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Ukuran Font (pt)</Label>
                        <Input
                          type="number"
                          min={8}
                          max={16}
                          value={draft.fontSize}
                          onChange={(e) => patch("fontSize", parseInt(e.target.value) || 11)}
                        />
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border">
                        <div
                          className="w-20 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: draft.primaryColor }}
                        >
                          Header
                        </div>
                        <div
                          className="w-20 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: draft.accentColor }}
                        >
                          Aksen
                        </div>
                        <span className="text-sm text-muted-foreground" style={{ fontSize: `${draft.fontSize}pt` }}>
                          Sample teks {draft.fontSize}pt
                        </span>
                      </div>
                    </TabsContent>

                    <TabsContent value="opsi" className="space-y-4">
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Tampilkan PPN</p>
                          <p className="text-xs text-muted-foreground">Tampilkan baris PPN 11% di total</p>
                        </div>
                        <Switch
                          checked={draft.showTax}
                          onCheckedChange={(v) => patch("showTax", v)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Kolom Tanda Tangan</p>
                          <p className="text-xs text-muted-foreground">Tampilkan area tanda tangan di bawah dokumen</p>
                        </div>
                        <Switch
                          checked={draft.showSignature}
                          onCheckedChange={(v) => patch("showSignature", v)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Kolom Stempel</p>
                          <p className="text-xs text-muted-foreground">Tampilkan area stempel perusahaan</p>
                        </div>
                        <Switch
                          checked={draft.showStamp}
                          onCheckedChange={(v) => patch("showStamp", v)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Format Template</Label>
                        <Select value={draft.templateFormat} onValueChange={(v) => patch("templateFormat", v as "pdf" | "html")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pdf">PDF</SelectItem>
                            <SelectItem value="html">HTML</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving || !dirty} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Simpan Template
                </Button>
                <Button variant="outline" onClick={handlePreview} disabled={previewing}>
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  Preview
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const saved = templates[activeType] ?? { ...DEFAULT, documentType: activeType };
                    setDraft(saved);
                    setDirty(false);
                    setPreviewHtml(null);
                  }}
                  title="Reset ke tersimpan"
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Preview Dokumen
                    </CardTitle>
                    {previewHtml && (
                      <Badge variant="secondary" className="text-xs">Live Preview</Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    Klik "Preview" untuk melihat tampilan dokumen menggunakan data dummy
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {previewHtml ? (
                    <iframe
                      ref={iframeRef}
                      title="Document Preview"
                      className="w-full rounded-b-lg border-0"
                      style={{ height: "680px" }}
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-80 text-muted-foreground gap-3">
                      <Building2 className="h-12 w-12 opacity-20" />
                      <p className="text-sm">Tekan tombol "Preview" untuk melihat tampilan dokumen</p>
                      <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
                        {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                        Generate Preview
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
