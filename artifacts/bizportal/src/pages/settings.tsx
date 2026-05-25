import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { User, Mail, Briefcase, Shield, MessageCircle, Save, Loader2, CheckCircle, Calculator, ChevronDown, ChevronUp, Package, Plus, X, Bot, Link2, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface CalcRates {
  airFreight:  { baseCost: number; ratePerKg: number;  handlingPct: number; customsFee: number };
  seaFreight:  { baseCost: number; ratePerCbm: number; handlingPct: number; customsFee: number };
  customs:     { baseCost: number; ratePerKg: number;  handlingFee: number; customsPct: number };
  domestic:    { baseCost: number; ratePerKg: number;  handlingPct: number };
  warehousing: { baseCost: number; ratePerCbm: number; handlingFee: number };
}

const DEFAULT_RATES: CalcRates = {
  airFreight:  { baseCost: 500000,  ratePerKg: 90000,    handlingPct: 5, customsFee: 1200000 },
  seaFreight:  { baseCost: 750000,  ratePerCbm: 2500000, handlingPct: 5, customsFee: 1500000 },
  customs:     { baseCost: 1500000, ratePerKg: 5000,     handlingFee: 500000, customsPct: 0.5 },
  domestic:    { baseCost: 500000,  ratePerKg: 8500,     handlingPct: 5 },
  warehousing: { baseCost: 5000000, ratePerCbm: 2500000, handlingFee: 500000 },
};

type ServiceKey = keyof CalcRates;

const SERVICE_LABELS: Record<ServiceKey, string> = {
  airFreight:  "Air Freight (Udara)",
  seaFreight:  "Sea Freight (Laut)",
  customs:     "Customs / Kepabeanan",
  domestic:    "Domestic / Lokal",
  warehousing: "Warehousing / Gudang",
};

type FieldDef = { key: string; label: string; unit: string };
const SERVICE_FIELDS: Record<ServiceKey, FieldDef[]> = {
  airFreight: [
    { key: "baseCost",    label: "Biaya Dasar",           unit: "IDR" },
    { key: "ratePerKg",   label: "Tarif per Kg",          unit: "IDR/kg" },
    { key: "handlingPct", label: "Handling Fee",          unit: "%" },
    { key: "customsFee",  label: "Biaya Bea Cukai",       unit: "IDR" },
  ],
  seaFreight: [
    { key: "baseCost",    label: "Biaya Dasar",           unit: "IDR" },
    { key: "ratePerCbm",  label: "Tarif per CBM",         unit: "IDR/CBM" },
    { key: "handlingPct", label: "Handling Fee",          unit: "%" },
    { key: "customsFee",  label: "Biaya Bea Cukai",       unit: "IDR" },
  ],
  customs: [
    { key: "baseCost",    label: "Biaya Dasar",           unit: "IDR" },
    { key: "ratePerKg",   label: "Tarif per Kg",          unit: "IDR/kg" },
    { key: "handlingFee", label: "Biaya Handling",        unit: "IDR" },
    { key: "customsPct",  label: "Bea Masuk (%)",         unit: "%" },
  ],
  domestic: [
    { key: "baseCost",    label: "Biaya Dasar",           unit: "IDR" },
    { key: "ratePerKg",   label: "Tarif per Kg",          unit: "IDR/kg" },
    { key: "handlingPct", label: "Handling Fee",          unit: "%" },
  ],
  warehousing: [
    { key: "baseCost",    label: "Biaya Dasar",           unit: "IDR" },
    { key: "ratePerCbm",  label: "Tarif per CBM/bulan",  unit: "IDR/CBM" },
    { key: "handlingFee", label: "Biaya Handling",        unit: "IDR" },
  ],
};

function CalculatorRatesCard() {

  const { toast } = useToast();
  const { t } = useLanguage();
  const [rates, setRates] = useState<CalcRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<ServiceKey | null>("airFreight");

  useEffect(() => {
    void (async () => {
      try {
        
        const res = await fetch("/api/settings/calculator-rates", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json() as CalcRates;
          setRates(data);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  function updateField(service: ServiceKey, field: string, raw: string) {
    const num = parseFloat(raw);
    if (isNaN(num) && raw !== "") return;
    setRates((prev) => ({
      ...prev,
      [service]: { ...(prev[service] as Record<string, number>), [field]: isNaN(num) ? 0 : num },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      
      const res = await fetch("/api/settings/calculator-rates", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          
        },
        body: JSON.stringify(rates),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: t.common.success });
    } catch (err) {
      toast({ title: t.common.error, description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Tarif Kalkulator Estimasi Biaya
        </CardTitle>
        <CardDescription>
          Konfigurasi tarif dasar untuk setiap jenis layanan logistik. Tarif ini digunakan oleh kalkulator di Customer Portal
          untuk menghitung estimasi biaya otomatis berdasarkan input pelanggan (berat, dimensi, rute).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : (
          <>
            {(Object.keys(SERVICE_LABELS) as ServiceKey[]).map((svc) => {
              const isOpen = expanded === svc;
              const fields = SERVICE_FIELDS[svc];
              const rateRow = rates[svc] as Record<string, number>;
              return (
                <div key={svc} className="rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : svc)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
                  >
                    <span className="font-semibold text-foreground text-sm">{SERVICE_LABELS[svc]}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-background">
                      {fields.map(({ key, label, unit }) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={`${svc}-${key}`} className="text-xs text-muted-foreground font-medium">
                            {label}
                          </Label>
                          <div className="relative">
                            <Input
                              id={`${svc}-${key}`}
                              type="number"
                              min="0"
                              step={unit === "%" ? "0.1" : "1000"}
                              value={rateRow[key] ?? ""}
                              onChange={(e) => updateField(svc, key, e.target.value)}
                              className="pr-16 text-right font-mono text-sm"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                              {unit}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Formula: Biaya Dasar + (Berat/CBM × Tarif) + Handling + Bea Cukai
              </p>
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan Tarif"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CargoTypesCard() {

  const { toast } = useToast();
  const { t } = useLanguage();
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newType, setNewType] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        
        const res = await fetch("/api/settings/cargo-types", {
          credentials: "include",
        });
        if (res.ok) setTypes(await res.json() as string[]);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  function addType() {
    const t = newType.trim();
    if (!t || types.includes(t)) { setNewType(""); return; }
    setTypes((prev) => [...prev, t]);
    setNewType("");
  }

  function removeType(idx: number) {
    setTypes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      
      const res = await fetch("/api/settings/cargo-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(types),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: t.common.success });
    } catch (err) {
      toast({ title: t.common.error, description: String(err), variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Daftar Cargo Type
        </CardTitle>
        <CardDescription>
          Daftar jenis kargo yang tersedia sebagai pilihan autocomplete di kalkulator Customer Portal.
          Pelanggan bisa mengetik untuk mencari atau pilih dari daftar ini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 min-h-[40px]">
              {types.length === 0 && <p className="text-sm text-muted-foreground italic">Belum ada item — tambahkan di bawah</p>}
              {types.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-sm bg-muted border border-border rounded-full px-3 py-1">
                  {t}
                  <button type="button" onClick={() => removeType(i)} className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-sm">
              <Input
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addType(); } }}
                placeholder="Contoh: Electronics"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addType} className="gap-1 shrink-0">
                <Plus className="h-4 w-4" /> Tambah
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Tekan Enter atau klik Tambah. Klik × untuk hapus item.</p>
            <div className="flex justify-end pt-1 border-t border-border">
              <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Save className="h-4 w-4" />}
                {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan Daftar"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type VendorFilterMode = "all" | "by-service-type";

interface AiIntakeSettingsData {
  enabled: boolean;
  replyWaTemplate: string;
  replyEmailSubject: string;
  replyEmailBody: string;
  vendorFilterMode: VendorFilterMode;
}

function AiIntakeSettingsCard() {

  const { toast } = useToast();
  const { t } = useLanguage();
  const [data, setData] = useState<AiIntakeSettingsData>({
    enabled: true,
    replyWaTemplate: "",
    replyEmailSubject: "",
    replyEmailBody: "",
    vendorFilterMode: "by-service-type",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        
        const res = await fetch("/api/settings/ai-intake", {
          credentials: "include",
        });
        if (res.ok) {
          const json = await res.json() as AiIntakeSettingsData;
          setData(json);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      
      const res = await fetch("/api/settings/ai-intake", {
        method: "PUT",
        headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: t.common.success });
    } catch (err) {
      toast({ title: t.common.error, description: String(err), variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-400" />
          AI Order Intake
        </CardTitle>
        <CardDescription>
          Ketika email atau WhatsApp masuk berisi inquiry order/freight, AI akan otomatis mengekstrak
          data dan membuat draft penawaran di menu <strong>Sales › AI Drafts</strong> untuk direview admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="font-medium text-sm">Aktifkan AI Intake</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  AI akan memproses setiap email/WA masuk dan membuat draft jika terdeteksi sebagai inquiry order
                </p>
              </div>
              <Switch
                checked={data.enabled}
                onCheckedChange={(v) => setData((d) => ({ ...d, enabled: v }))}
              />
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div>
                <p className="font-medium text-sm">Filter Vendor Default</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Menentukan vendor mana yang menerima RFQ saat forward-to-vendor dilakukan tanpa pemilihan manual
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="vendorFilterMode"
                    value="by-service-type"
                    checked={data.vendorFilterMode === "by-service-type"}
                    onChange={() => setData((d) => ({ ...d, vendorFilterMode: "by-service-type" }))}
                    className="mt-0.5"
                    disabled={!data.enabled}
                  />
                  <span>
                    <span className="text-sm font-medium">Cocokkan dengan moda transportasi</span>
                    <span className="block text-xs text-muted-foreground">Hanya kirim ke vendor dengan serviceType yang sesuai (misal: air freight untuk moda udara)</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="vendorFilterMode"
                    value="all"
                    checked={data.vendorFilterMode === "all"}
                    onChange={() => setData((d) => ({ ...d, vendorFilterMode: "all" }))}
                    className="mt-0.5"
                    disabled={!data.enabled}
                  />
                  <span>
                    <span className="text-sm font-medium">Semua vendor aktif</span>
                    <span className="block text-xs text-muted-foreground">Kirim ke seluruh vendor/supplier yang aktif tanpa filter serviceType</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-reply-wa">Template Balasan WhatsApp Otomatis</Label>
              <Textarea
                id="ai-reply-wa"
                value={data.replyWaTemplate}
                onChange={(e) => setData((d) => ({ ...d, replyWaTemplate: e.target.value }))}
                rows={4}
                className="font-mono text-sm"
                placeholder="Gunakan {docNumber} untuk menyisipkan nomor draft"
                disabled={!data.enabled}
              />
              <p className="text-xs text-muted-foreground">
                Gunakan <code className="bg-muted px-1 rounded">{"{docNumber}"}</code> untuk menyisipkan nomor draft secara otomatis.
                Kosongkan untuk tidak mengirim balasan.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-email-subj">Subject Email Balasan Otomatis</Label>
              <Input
                id="ai-email-subj"
                value={data.replyEmailSubject}
                onChange={(e) => setData((d) => ({ ...d, replyEmailSubject: e.target.value }))}
                placeholder="[Draft Diterima] {docNumber} — Terima kasih"
                disabled={!data.enabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-email-body">Isi Email Balasan Otomatis</Label>
              <Textarea
                id="ai-email-body"
                value={data.replyEmailBody}
                onChange={(e) => setData((d) => ({ ...d, replyEmailBody: e.target.value }))}
                rows={5}
                className="font-mono text-sm"
                placeholder="Gunakan {docNumber} untuk menyisipkan nomor draft"
                disabled={!data.enabled}
              />
            </div>

            <div className="flex justify-end pt-1 border-t border-border">
              <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Save className="h-4 w-4" />}
                {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan Pengaturan"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WhatsAppNotificationCard() {

  const { toast } = useToast();
  const { t } = useLanguage();
  const [adminWa, setAdminWa] = useState("");
  const [adminGroupWa, setAdminGroupWa] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/notifications", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json() as { adminWa: string; adminGroupWa?: string };
          setAdminWa(data.adminWa ?? "");
          setAdminGroupWa(data.adminGroupWa ?? "");
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminWa, adminGroupWa }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: t.common.success });
    } catch (err) {
      toast({ title: t.common.error, description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Notifikasi WhatsApp
        </CardTitle>
        <CardDescription>
          Konfigurasi nomor dan grup WhatsApp yang menerima notifikasi otomatis saat ada order baru.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full max-w-sm bg-muted" />
            <Skeleton className="h-10 w-full max-w-sm bg-muted" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="admin-wa">Nomor WhatsApp Admin (Personal)</Label>
              <Input
                id="admin-wa"
                value={adminWa}
                onChange={(e) => setAdminWa(e.target.value)}
                placeholder="628xxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Menerima notifikasi untuk Sales Quotation, Sales Order, Logistik, dan E-commerce Order.
                Format: <code>6281234567890</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-group-wa" className="flex items-center gap-1.5">
                Group ID WhatsApp Admin
                <span className="text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 rounded px-1.5 py-0.5">
                  Push Notif Grup
                </span>
              </Label>
              <Input
                id="admin-group-wa"
                value={adminGroupWa}
                onChange={(e) => setAdminGroupWa(e.target.value)}
                placeholder="120363xxxxxxxxxx@g.us"
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Setiap order logistik baru dari Customer Portal akan dikirim ke grup ini dengan detail lengkap dan nomor tracking otomatis.
                </p>
                <p className="text-amber-600 dark:text-amber-400">
                  ⚠️ Isi dengan Group ID Fonnte (format <code>120363xxxxxxxxxx@g.us</code>).
                  Kosongkan jika tidak ingin notifikasi grup.
                </p>
                <p>
                  Cara cari Group ID: Kirim pesan dari grup ke bot Fonnte, lalu cek log di dashboard Fonnte — Group ID terlihat di kolom <em>target</em>.
                </p>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="gap-2 w-fit"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VendorMiniFormCard() {
  const [stats, setStats] = useState<{ links: number; activeLinks: number; submissions: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [links, subs] = await Promise.all([
          fetch("/api/vendor-form/admin/links", { credentials: "include" }).then(r => r.json()),
          fetch("/api/vendor-form/admin/submissions", { credentials: "include" }).then(r => r.json()),
        ]);
        const linksArr = Array.isArray(links) ? links : [];
        const subsArr = Array.isArray(subs) ? subs : [];
        const now = new Date();
        setStats({
          links: linksArr.length,
          activeLinks: linksArr.filter((l: { isActive: boolean; expiresAt: string | null }) =>
            l.isActive && (!l.expiresAt || new Date(l.expiresAt) >= now)
          ).length,
          submissions: subsArr.length,
        });
      } catch { /* noop */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Link2 className="h-5 w-5 text-indigo-400" />
          Vendor Mini Form
        </CardTitle>
        <CardDescription>
          Buat dan kelola link form dinamis untuk vendor mengisi rate/data layanan.
          Setiap link berisi field sesuai service type yang dapat dibagikan langsung ke vendor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.links}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Link</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-2xl font-bold text-green-500">{stats.activeLinks}</p>
              <p className="text-xs text-muted-foreground mt-1">Link Aktif</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4 text-center">
              <p className="text-2xl font-bold text-indigo-400">{stats.submissions}</p>
              <p className="text-xs text-muted-foreground mt-1">Submission Masuk</p>
            </div>
          </div>
        ) : null}

        <div className="pt-2 border-t border-border flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Kelola semua link form, lihat submission masuk, dan bagikan ke vendor di halaman khusus Mini Form.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => { window.location.href = "/bizportal/purchase/vendor-forms"; }}
          >
            <Link2 className="h-4 w-4" />
            Buka Manajemen Mini Form
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── WA Template Editor (Upgraded GB1) ─────────────────────────────────────────
type RecipientKey = "admin_personal" | "admin_group" | "customer" | "vendor";
type WorkflowKey =
  | "order_new" | "vendor_request" | "vendor_submission" | "vendor_revision"
  | "customer_approval" | "customer_approved" | "so_created" | "op_request"
  | "driver_assigned" | "shipment_update" | "customs_update" | "delivery_completed";
type ServiceTypeSim = "trucking" | "freight_sea" | "freight_air" | "ppjk" | "product" | "handling" | "";

const RECIPIENT_META: Record<RecipientKey, { label: string; icon: string }> = {
  admin_personal: { label: "Admin Pribadi", icon: "👤" },
  admin_group:    { label: "Grup Admin",    icon: "👥" },
  customer:       { label: "Customer",      icon: "🛍️" },
  vendor:         { label: "Vendor",        icon: "🏭" },
};

const WORKFLOW_META: Record<WorkflowKey, { label: string; icon: string; desc: string }> = {
  order_new:          { label: "Order Baru",          icon: "📦", desc: "Notifikasi saat order baru masuk dari customer portal" },
  vendor_request:     { label: "Vendor Request",      icon: "📋", desc: "Kirim mini form link ke vendor untuk pengisian penawaran" },
  vendor_submission:  { label: "Vendor Submit",       icon: "📩", desc: "Notifikasi admin saat vendor submit penawaran" },
  vendor_revision:    { label: "Revisi Penawaran",    icon: "↩️", desc: "Minta revisi harga ke vendor" },
  customer_approval:  { label: "Customer Approval",   icon: "✅", desc: "Kirim link persetujuan penawaran ke customer" },
  customer_approved:  { label: "Customer Approved",   icon: "🎉", desc: "Notifikasi admin saat customer menyetujui" },
  so_created:         { label: "SO Terkonfirmasi",    icon: "📑", desc: "Konfirmasi Sales Order ke customer" },
  op_request:         { label: "Op. Request",         icon: "⚙️", desc: "Kirim form konfirmasi operasional ke vendor" },
  driver_assigned:    { label: "Driver Ditugaskan",   icon: "🚚", desc: "Notifikasi customer saat driver ditugaskan" },
  shipment_update:    { label: "Update Shipment",     icon: "🚢", desc: "Update status pengiriman ke customer" },
  customs_update:     { label: "Update Kepabeanan",   icon: "🏛️", desc: "Update status bea cukai ke customer" },
  delivery_completed: { label: "Pengiriman Selesai",  icon: "🏁", desc: "Notifikasi penyelesaian pengiriman" },
};

const VAR_GROUPS: Array<{ label: string; color: string; vars: string[] }> = [
  { label: "Dasar",    color: "bg-slate-100 text-slate-700 border-slate-300",   vars: ["orderNumber","tanggal","jam","timestamp"] },
  { label: "Order",    color: "bg-blue-50 text-blue-700 border-blue-200",       vars: ["serviceType","shipmentType","route","commodity","cargoDescription","grossWeightDisplay","volumeDisplay","jumlahKoliDisplay","requiredDate","totalEst","serviceList","notes"] },
  { label: "Customer", color: "bg-green-50 text-green-700 border-green-200",    vars: ["customerName","customerDisplay","customerPhone","email","phone"] },
  { label: "Vendor",   color: "bg-purple-50 text-purple-700 border-purple-200", vars: ["vendorName","vendorPhone"] },
  { label: "Harga",    color: "bg-amber-50 text-amber-700 border-amber-200",    vars: ["vendorPrice","sellingPrice","currency","margin"] },
  { label: "Link",     color: "bg-indigo-50 text-indigo-700 border-indigo-200", vars: ["vendorMiniFormLink","customerApprovalLink","operationalFormLink","adminActionUrl","responseUrl"] },
  { label: "🚛 Trk",   color: "bg-orange-50 text-orange-700 border-orange-200", vars: ["driverName","driverPhone","plateNumber","vehicleType"] },
  { label: "🚢 Sea",   color: "bg-cyan-50 text-cyan-700 border-cyan-200",       vars: ["vessel","voyage","containerNumber","blNumber"] },
  { label: "✈️ Air",   color: "bg-sky-50 text-sky-700 border-sky-200",          vars: ["airline","awbNumber","flightNumber"] },
  { label: "🏛️ PPJ",  color: "bg-rose-50 text-rose-700 border-rose-200",       vars: ["ajuNumber","bcType","sppbNumber"] },
];

const COND_BLOCKS = [
  { label: "Trucking",    icon: "🚛", cond: "trucking",   hint: "Muncul hanya jika service type = trucking" },
  { label: "Sea Freight", icon: "🚢", cond: "freight_sea", hint: "Muncul hanya jika service type = sea freight" },
  { label: "Air Freight", icon: "✈️", cond: "freight_air", hint: "Muncul hanya jika service type = air freight" },
  { label: "PPJK",        icon: "🏛️", cond: "ppjk",       hint: "Muncul hanya jika service type = PPJK" },
  { label: "Product",     icon: "📦", cond: "product",     hint: "Muncul hanya jika service type = product" },
];

const SAMPLE_DATA: Record<string, Record<string, string>> = {
  "": {
    orderNumber: "CST/2025/000123", tanggal: "25 Mei 2025", jam: "09:00", timestamp: "25 Mei 2025 09:00",
    serviceType: "[service type]", shipmentType: "Import", route: "Shanghai → Jakarta", commodity: "Electronics",
    cargoDescription: "Electronic components", grossWeightDisplay: "500 kg", volumeDisplay: "2.5 CBM",
    jumlahKoliDisplay: "10 koli", requiredDate: "30 Mei 2025", totalEst: "15.000.000",
    serviceList: "- Sea Freight\n- Customs Clearance", notes: "Handle with care",
    customerName: "PT. Maju Sejahtera", customerDisplay: "PT. Maju Sejahtera", customerPhone: "6281234567890",
    email: "info@majusejahtera.com", phone: "6281234567890",
    vendorName: "PT. Trans Cepat", vendorPhone: "6289876543210",
    vendorPrice: "Rp 12.000.000", sellingPrice: "Rp 15.000.000", currency: "IDR", margin: "Rp 3.000.000",
    vendorMiniFormLink: "https://cst.app/vendor-form/xxxxx",
    customerApprovalLink: "https://cst.app/approval/yyyyy",
    operationalFormLink: "https://cst.app/op-confirm/zzzzz",
    adminActionUrl: "https://cst.app/admin/action/aaaaa",
    responseUrl: "https://cst.app/vendor-response/bbbbb",
    driverName: "Budi Santoso", driverPhone: "6287654321098", plateNumber: "B 1234 XYZ", vehicleType: "Truk CDD",
    vessel: "MV Ever Given", voyage: "V.025E", containerNumber: "MSCU1234567", blNumber: "MSCUA123456",
    airline: "Garuda Indonesia", awbNumber: "126-12345678", flightNumber: "GA-888",
    ajuNumber: "090100-2025-000123", bcType: "BC 2.0", sppbNumber: "SPPB-2025-000456",
  },
  trucking:    { serviceType: "Trucking",    shipmentType: "Domestik", route: "Jakarta → Surabaya", driverName: "Budi Santoso", driverPhone: "6287654321098", plateNumber: "B 1234 XYZ", vehicleType: "Truk CDD" },
  freight_sea: { serviceType: "Sea Freight", shipmentType: "Import",   route: "Shanghai → Jakarta", vessel: "MV Ever Given", voyage: "V.025E", containerNumber: "MSCU1234567", blNumber: "MSCUA123456" },
  freight_air: { serviceType: "Air Freight", shipmentType: "Export",   route: "Jakarta → Singapore", airline: "Garuda Indonesia", awbNumber: "126-12345678", flightNumber: "GA-888" },
  ppjk:        { serviceType: "PPJK",        shipmentType: "Import",   ajuNumber: "090100-2025-000123", bcType: "BC 2.0", sppbNumber: "SPPB-2025-000456" },
  product:     { serviceType: "Product",     shipmentType: "Domestik" },
};

function renderWaPreview(body: string, svcType: ServiceTypeSim): string {
  let result = body.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, cond, content: string) =>
    svcType ? (cond === svcType ? content : "") : `‹${cond.toUpperCase()}›${content.trim()}‹/${cond.toUpperCase()}›`
  );
  const base = SAMPLE_DATA[""] ?? {};
  const svc  = svcType ? (SAMPLE_DATA[svcType] ?? {}) : {};
  const data  = { ...base, ...svc };
  result = result.replace(/\{\{(\w+)\}\}/g, (_m, k) => data[k] ?? `{{${k}}}`);
  const lines = result.split("\n").filter(line => !line.includes("{{") || line.trim() === "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const DEFAULT_BODY: Partial<Record<RecipientKey, Partial<Record<WorkflowKey, string>>>> = {
  admin_personal: {
    order_new: [
      "🚢 *ORDER LOGISTIK BARU*","━━━━━━━━━━━━━━━━━━",
      "No. Order       : `{{orderNumber}}`","Tanggal         : {{tanggal}}","Jam             : {{jam}}",
      "Customer        : {{customerDisplay}}","Email           : {{email}}","HP              : {{phone}}",
      "Jenis           : {{shipmentType}}","Rute            : {{route}}","Kategori Barang : {{commodity}}",
      "Deskripsi       : {{cargoDescription}}","Berat           : {{grossWeightDisplay}}","Volume          : {{volumeDisplay}}",
      "Jumlah Koli     : {{jumlahKoliDisplay}}","Layanan         :","{{serviceList}}","Total Est.      : Rp {{totalEst}}",
      "Tgl Kirim       : {{requiredDate}}","Catatan         : {{notes}}","━━━━━━━━━━━━━━━━━━",
      "⚡ *Aksi Cepat Admin (tanpa login):*","🔭 Review & Blast Vendor → {{adminActionUrl}}","_Dikirim: {{timestamp}}_",
    ].join("\n"),
    vendor_submission: ["📩 *VENDOR SUBMIT — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Vendor *{{vendorName}}* telah mengirim penawaran.","","Order: {{orderNumber}}","Service: {{serviceType}}","💰 Harga Vendor: {{vendorPrice}}","","Segera review dan kirim approval ke customer.","_{{timestamp}}_"].join("\n"),
    customer_approved: ["✅ *CUSTOMER APPROVED — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Customer: *{{customerName}}*","Order: {{orderNumber}}","Status: DISETUJUI ✅","","Segera proses konfirmasi operasional ke vendor.","_{{timestamp}}_"].join("\n"),
    delivery_completed: ["🏁 *PENGIRIMAN SELESAI — {{orderNumber}}*","Customer: {{customerName}}","Rute: {{route}}","_{{timestamp}}_"].join("\n"),
  },
  admin_group: {
    order_new: [
      "🔔 *[ORDER MASUK] {{orderNumber}}*","━━━━━━━━━━━━━━━━━━",
      "🏷️ No. Tracking  : `{{orderNumber}}`","📆 Tanggal       : {{tanggal}}",
      "👤 Customer      : *{{customerDisplay}}*","📞 HP            : {{phone}}","📧 Email         : {{email}}","━━━━━━━━━━━━━━━━━━",
      "🚢 Jenis         : {{shipmentType}}","📍 Rute          : {{route}}","📦 Komoditi      : {{commodity}}",
      "📋 Deskripsi     : {{cargoDescription}}","⚖️ Berat         : {{grossWeightDisplay}}","📐 Volume        : {{volumeDisplay}}",
      "📅 Tgl Kirim     : {{requiredDate}}","📝 Catatan       : {{notes}}","━━━━━━━━━━━━━━━━━━",
      "💰 Total Est.    : *Rp {{totalEst}}*","🔵 Status        : Menunggu Konfirmasi","━━━━━━━━━━━━━━━━━━",
      "⚡ *Aksi Cepat (tanpa login):*","🚀 Review & Blast Vendor → {{adminActionUrl}}","",
      "_Harap segera diproses. Dikirim: {{timestamp}}_",
    ].join("\n"),
    vendor_submission: ["📩 *VENDOR SUBMIT — {{orderNumber}}*","Vendor *{{vendorName}}* — Service: {{serviceType}}","💰 Harga: {{vendorPrice}}","","Segera review!","_{{timestamp}}_"].join("\n"),
    customer_approved: ["🎉 *CUSTOMER APPROVED — {{orderNumber}}*","Customer *{{customerName}}* menyetujui penawaran.","Proses operasional sekarang!","_{{timestamp}}_"].join("\n"),
  },
  customer: {
    order_new: [
      "✅ *PESANAN ANDA DITERIMA*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","",
      "Terima kasih telah mempercayakan pengiriman Anda kepada CST Logistics.","",
      "No. Order       : *{{orderNumber}}*","Tanggal         : {{tanggal}}","Jam             : {{jam}}",
      "Status          : Menunggu Penawaran Harga","Rute            : {{route}}","Kategori Barang : {{commodity}}",
      "Berat           : {{grossWeightDisplay}}","Volume          : {{volumeDisplay}}","Layanan         :","{{serviceList}}",
      "Tgl Butuh       : {{requiredDate}}","━━━━━━━━━━━━━━━━━━",
      "Tim kami sedang memproses permintaan Anda dan akan segera mengirimkan *penawaran harga terbaik* untuk Anda.","",
      "📞 Jakarta: (021) 6241234 | Tangerang: (021) 5591234","","_Dikirim: {{timestamp}}_",
    ].join("\n"),
    customer_approval: ["✅ *PENAWARAN SIAP — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Penawaran untuk order *{{orderNumber}}* telah siap.","","💰 Harga: *{{sellingPrice}}*","Rute: {{route}}","","Silakan review dan konfirmasi:","🔗 {{customerApprovalLink}}","","Penawaran berlaku 24 jam.","Terima kasih 🙏"].join("\n"),
    customer_approved: ["🎉 *TERIMA KASIH TELAH MENGKONFIRMASI!*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Penawaran order *{{orderNumber}}* telah diterima.","Tim operasional kami sedang memprosesnya.","","📞 Pertanyaan: (021) 6241234","_Dikirim: {{timestamp}}_"].join("\n"),
    so_created: ["📑 *SALES ORDER TERKONFIRMASI — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Pesanan Anda telah resmi dikonfirmasi!","","💰 Harga: {{sellingPrice}}","Rute: {{route}}","","Tim kami akan segera memproses pengiriman.","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    driver_assigned: ["🚚 *DRIVER DITUGASKAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Driver untuk order *{{orderNumber}}* telah ditugaskan:","","{{#if trucking}}","👤 Driver: {{driverName}}","📞 HP: {{driverPhone}}","🚛 Kendaraan: {{vehicleType}}","🔢 No. Plat: {{plateNumber}}","{{/if}}","","Driver akan segera menghubungi Anda.","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    shipment_update: ["📦 *UPDATE PENGIRIMAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Update status pengiriman order *{{orderNumber}}*:","Rute: {{route}}","","{{#if freight_sea}}","🚢 Kapal: {{vessel}} / Voyage: {{voyage}}","📦 Container: {{containerNumber}}","📃 BL No: {{blNumber}}","{{/if}}","","{{#if freight_air}}","✈️ Airline: {{airline}}","📋 AWB: {{awbNumber}}","🛫 Flight: {{flightNumber}}","{{/if}}","","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    customs_update: ["🏛️ *UPDATE KEPABEANAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Update status kepabeanan order *{{orderNumber}}*:","","{{#if ppjk}}","📋 No. Aju: {{ajuNumber}}","📄 BC Type: {{bcType}}","✅ SPPB: {{sppbNumber}}","{{/if}}","","Terima kasih 🙏"].join("\n"),
    delivery_completed: ["🏁 *PENGIRIMAN SELESAI — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Pengiriman order *{{orderNumber}}* telah selesai! ✅","Rute: {{route}}","","Terima kasih telah menggunakan CST Logistics!","Kami harap pelayanan kami memuaskan.","","📞 Feedback: (021) 6241234","_Dikirim: {{timestamp}}_"].join("\n"),
  },
  vendor: {
    order_new: [
      "📦 *PERMINTAAN ORDER BARU — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","",
      "No. Order       : *{{orderNumber}}*","Tanggal         : {{tanggal}}","Jam             : {{jam}}",
      "Jenis           : {{shipmentType}}","Rute            : {{route}}","Kategori Barang : {{commodity}}",
      "Deskripsi       : {{cargoDescription}}","Berat           : {{grossWeightDisplay}}","Volume          : {{volumeDisplay}}",
      "Jumlah Koli     : {{jumlahKoliDisplay}}","Tgl Butuh       : {{requiredDate}}","Layanan         :","{{serviceList}}","Catatan         : {{notes}}","━━━━━━━━━━━━━━━━━━━━",
      "🔗 *Aksi Cepat (klik link):*","✅ Terima  → {{responseUrl}}?action=accept",
      "❌ Tolak   → {{responseUrl}}?action=reject","💬 Form    → {{responseUrl}}","",
      "✏️ *Atau balas WA dengan format:*","📌 Harga: `{{orderNumber}} [HARGA] [TGL_PICKUP]`",
      "📌 Terima: `TERIMA {{orderNumber}}`","📌 Tolak:  `TOLAK {{orderNumber}}`","","Terima kasih 🙏","_Dikirim: {{timestamp}}_",
    ].join("\n"),
    vendor_request: ["📋 *PERMINTAAN PENAWARAN — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","Order *{{orderNumber}}* membutuhkan layanan *{{serviceType}}*.","Mohon isi form penawaran melalui link berikut:","","🔗 {{vendorMiniFormLink}}","","{{#if trucking}}","Detail: Rute {{route}}","Berat: {{grossWeightDisplay}} | Volume: {{volumeDisplay}}","{{/if}}","","{{#if freight_sea}}","Detail: Rute {{route}}","Berat: {{grossWeightDisplay}} | Container: {{containerNumber}}","{{/if}}","","{{#if freight_air}}","Detail: Rute {{route}}","Berat: {{grossWeightDisplay}}","{{/if}}","","{{#if ppjk}}","Detail: Rute {{route}} | Komoditi: {{commodity}}","{{/if}}","","Tgl Butuh: {{requiredDate}}","Catatan: {{notes}}","","Terima kasih atas kerjasamanya 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    vendor_revision: ["↩️ *REVISI PENAWARAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","Kami memerlukan revisi harga untuk order *{{orderNumber}}*.","Harga saat ini: {{vendorPrice}}","","Mohon kirim penawaran terbaik Anda kembali:","🔗 {{vendorMiniFormLink}}","","Terima kasih 🙏"].join("\n"),
    op_request: ["⚙️ *KONFIRMASI OPERASIONAL — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","Customer telah menyetujui penawaran untuk order *{{orderNumber}}*.","Mohon lengkapi data operasional:","","🔗 {{operationalFormLink}}","","{{#if trucking}}","Data dibutuhkan: Driver, No. Plat, jadwal pickup.","{{/if}}","","{{#if freight_sea}}","Data dibutuhkan: Vessel, Voyage, ETA/ETD, BL.","{{/if}}","","{{#if freight_air}}","Data dibutuhkan: Airline, AWB, jadwal penerbangan.","{{/if}}","","{{#if ppjk}}","Data dibutuhkan: No. Aju, BC type, SPPB.","{{/if}}","","Terima kasih atas kerjasamanya 🙏"].join("\n"),
  },
};

function getDefaultBody(recipient: RecipientKey, workflow: WorkflowKey): string {
  return DEFAULT_BODY[recipient]?.[workflow] ?? "";
}

function WaTemplatesCard() {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [recipient, setRecipient] = useState<RecipientKey>("admin_personal");
  const [workflow, setWorkflow] = useState<WorkflowKey>("order_new");
  const [simSvc, setSimSvc] = useState<ServiceTypeSim>("");

  const cfgKey = (r: RecipientKey, w: WorkflowKey) => `${r}__${w}`;
  const currentBody = configs[cfgKey(recipient, workflow)] ?? getDefaultBody(recipient, workflow);
  const isSaved = savedKeys.has(cfgKey(recipient, workflow));

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/wa-template-configs", { credentials: "include" });
        if (res.ok) {
          const data = await res.json() as { configs: Record<string, string>; savedKeys: string[] };
          setConfigs(data.configs ?? {});
          setSavedKeys(new Set(data.savedKeys ?? []));
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const setBody = (body: string) =>
    setConfigs(prev => ({ ...prev, [cfgKey(recipient, workflow)]: body }));

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) { setBody(currentBody + text); return; }
    const s = el.selectionStart, e = el.selectionEnd;
    const next = currentBody.slice(0, s) + text + currentBody.slice(e);
    setBody(next);
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + text.length; el.focus(); }, 0);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = configs[cfgKey(recipient, workflow)] ?? getDefaultBody(recipient, workflow);
      const res = await fetch("/api/settings/wa-template-configs", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ recipient, workflow, body }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedKeys(prev => new Set([...prev, cfgKey(recipient, workflow)]));
      toast({ title: "Template tersimpan" });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch(`/api/settings/wa-template-configs/${recipient}/${workflow}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const key = cfgKey(recipient, workflow);
      setConfigs(prev => { const n = { ...prev }; delete n[key]; return n; });
      setSavedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      toast({ title: "Template direset ke default" });
    } catch (e) {
      toast({ title: "Gagal reset", description: String(e), variant: "destructive" });
    } finally { setResetting(false); }
  }

  const preview = renderWaPreview(currentBody, simSvc);

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Template Pesan WhatsApp
        </CardTitle>
        <CardDescription>
          Atur format pesan WA per workflow dan penerima. Gunakan{" "}
          <code className="bg-muted px-1 rounded text-xs">{"{{variabel}}"}</code> untuk data dinamis dan{" "}
          <code className="bg-muted px-1 rounded text-xs">{"{{#if trucking}}...{{/if}}"}</code> untuk blok kondisional per service type.
          Baris dengan variabel kosong dihilangkan otomatis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
        ) : (
          <div className="space-y-5">

            {/* ── Recipient Tabs ── */}
            <Tabs value={recipient} onValueChange={v => setRecipient(v as RecipientKey)}>
              <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50">
                {(Object.keys(RECIPIENT_META) as RecipientKey[]).map(k => (
                  <TabsTrigger key={k} value={k} className="text-xs gap-1">
                    <span>{RECIPIENT_META[k].icon}</span> {RECIPIENT_META[k].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* ── Workflow Selector ── */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pilih Workflow Stage:</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(WORKFLOW_META) as WorkflowKey[]).map(w => {
                  const m = WORKFLOW_META[w];
                  const isActive = w === workflow;
                  const hasSaved = savedKeys.has(cfgKey(recipient, w));
                  return (
                    <button
                      key={w}
                      type="button"
                      title={m.desc}
                      onClick={() => setWorkflow(w)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-all flex items-center gap-1 ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted hover:bg-accent text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      <span>{m.icon}</span>
                      {m.label}
                      {hasSaved && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Workflow Info Banner ── */}
            <div className="bg-muted/40 border rounded-lg p-3 flex items-start gap-3">
              <span className="text-xl mt-0.5">{WORKFLOW_META[workflow].icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{WORKFLOW_META[workflow].label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{WORKFLOW_META[workflow].desc}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Penerima: <span className="font-medium text-foreground">{RECIPIENT_META[recipient].icon} {RECIPIENT_META[recipient].label}</span>
                  {isSaved
                    ? <span className="ml-2 text-amber-600 font-medium">● Dikustomisasi</span>
                    : <span className="ml-2 text-muted-foreground">○ Default</span>}
                </p>
              </div>
            </div>

            {/* ── Variable Chips (grouped) ── */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Variabel (klik untuk insert ke cursor):</p>
              {VAR_GROUPS.map(g => (
                <div key={g.label} className="flex flex-wrap items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground w-12 shrink-0 text-right pr-1">{g.label}</span>
                  {g.vars.map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`text-[10px] font-mono border rounded px-1.5 py-0.5 cursor-pointer transition-colors hover:opacity-80 ${g.color}`}
                      title={`Klik untuk insert {{${v}}}`}
                      onClick={() => insertAtCursor(`{{${v}}}`)}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* ── Conditional Block Inserters ── */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blok kondisional (klik untuk insert):</p>
              <div className="flex flex-wrap gap-2">
                {COND_BLOCKS.map(b => (
                  <button
                    key={b.cond}
                    type="button"
                    title={b.hint}
                    className="text-xs border border-dashed rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/60 hover:bg-muted/50 transition-colors flex items-center gap-1.5"
                    onClick={() => insertAtCursor(`{{#if ${b.cond}}}\n\n{{/if}}`)}
                  >
                    <span>{b.icon}</span>
                    <code className="text-[10px]">{`{{#if ${b.cond}}}`}</code>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Konten di dalam blok hanya muncul jika service type cocok. Bisa di-nested dengan variabel service-specific.</p>
            </div>

            {/* ── Template Textarea ── */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium flex items-center gap-1.5">
                ✏️ <span>Edit Template</span>
                <span className="text-muted-foreground font-normal">(klik variabel di atas untuk insert langsung ke posisi kursor)</span>
              </p>
              <Textarea
                ref={textareaRef}
                className="font-mono text-xs min-h-[280px] resize-y border-primary/40 focus:border-primary leading-relaxed"
                value={currentBody}
                onChange={e => setBody(e.target.value)}
                placeholder={`Template kosong — tulis pesan untuk workflow "${WORKFLOW_META[workflow].label}" penerima "${RECIPIENT_META[recipient].label}"…`}
                spellCheck={false}
              />
            </div>

            {/* ── Real-time Preview ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview Real-time</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Simulasi service type:</span>
                  <select
                    className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                    value={simSvc}
                    onChange={e => setSimSvc(e.target.value as ServiceTypeSim)}
                  >
                    <option value="">— Tidak dipilih (tampilkan semua blok) —</option>
                    <option value="trucking">🚛 Trucking</option>
                    <option value="freight_sea">🚢 Sea Freight</option>
                    <option value="freight_air">✈️ Air Freight</option>
                    <option value="ppjk">🏛️ PPJK</option>
                    <option value="product">📦 Product</option>
                    <option value="handling">🏗️ Handling</option>
                  </select>
                </div>
              </div>
              <div className="font-mono text-xs bg-muted/40 border rounded-md p-3 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                {preview
                  ? preview.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                      part.startsWith("{{")
                        ? <span key={i} className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded px-0.5">{part}</span>
                        : part
                    )
                  : <span className="text-muted-foreground italic">Template masih kosong</span>}
              </div>
              {simSvc && (
                <p className="text-xs text-muted-foreground">
                  Blok <code>{`{{#if ${simSvc}}}`}</code> ditampilkan · blok lainnya disembunyikan · variabel kosong dihapus otomatis
                </p>
              )}
            </div>

            {/* ── Action Buttons ── */}
            <div className="flex items-center gap-2 pt-1 border-t">
              <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Simpan
              </Button>
              {isSaved && (
                <Button
                  size="sm" variant="outline" className="gap-1.5 text-muted-foreground"
                  disabled={resetting}
                  onClick={() => void handleReset()}
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset ke Default
                </Button>
              )}
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { isAuthenticated } = useSupabaseAuth();
  const { data: dbUser, isLoading } = useGetCurrentUser({
    query: {
      enabled: isAuthenticated,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    }
  });

  const isAdmin = dbUser?.role === "admin";

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your account preferences and view your organizational role.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="col-span-1 md:col-span-2 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Profile Information
              </CardTitle>
              <CardDescription>Your personal details within BizPortal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 bg-muted" />
                    <Skeleton className="h-10 w-full bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 bg-muted" />
                    <Skeleton className="h-10 w-full bg-muted" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <User className="h-4 w-4" /> Full Name
                    </label>
                    <div className="p-3 bg-background rounded-md border border-border text-foreground font-medium">
                      {dbUser?.name || "Not provided"}
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email Address
                    </label>
                    <div className="p-3 bg-background rounded-md border border-border text-foreground font-medium">
                      {dbUser?.email || "Not provided"}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Access Level
              </CardTitle>
              <CardDescription>Your assigned permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-24 bg-muted rounded-full" />
                  <Skeleton className="h-8 w-32 bg-muted rounded-full" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col space-y-3">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Role
                    </label>
                    <div>
                      <Badge variant="default" className="text-sm px-3 py-1 bg-primary text-primary-foreground uppercase tracking-wider">
                        {dbUser?.role || "Unassigned"}
                      </Badge>
                    </div>
                  </div>
                  
                  {dbUser?.division && (
                    <div className="flex flex-col space-y-3">
                      <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Briefcase className="h-4 w-4" /> Division
                      </label>
                      <div>
                        <Badge variant="outline" className="text-sm px-3 py-1 border-border text-foreground">
                          {dbUser.division}
                        </Badge>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          
          {isAdmin && <WhatsAppNotificationCard />}
          {isAdmin && <AiIntakeSettingsCard />}
          {isAdmin && <CargoTypesCard />}
          {isAdmin && <CalculatorRatesCard />}
          {isAdmin && <VendorMiniFormCard />}
          {isAdmin && <WaTemplatesCard />}

          <Card className="col-span-1 md:col-span-3 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl">Authentication</CardTitle>
              <CardDescription>Manage your security settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Replit Auth</p>
                  <p className="text-sm text-muted-foreground">Your account is managed via Replit authentication.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { window.location.href = "/api/logout?redirect=/bizportal/"; }}>
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
