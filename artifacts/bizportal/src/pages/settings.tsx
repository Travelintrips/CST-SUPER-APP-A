import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { UserButton, useUser, useAuth } from "@clerk/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { User, Mail, Briefcase, Shield, MessageCircle, Save, Loader2, CheckCircle, Calculator, ChevronDown, ChevronUp, Package, Plus, X, Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [rates, setRates] = useState<CalcRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<ServiceKey | null>("airFreight");

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/settings/calculator-rates", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json() as CalcRates;
          setRates(data);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [getToken]);

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
      const token = await getToken();
      const res = await fetch("/api/settings/calculator-rates", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(rates),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Tarif kalkulator berhasil disimpan" });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
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
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newType, setNewType] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/settings/cargo-types", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setTypes(await res.json() as string[]);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [getToken]);

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
      const token = await getToken();
      const res = await fetch("/api/settings/cargo-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(types),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Daftar Cargo Type berhasil disimpan" });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
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
  const { getToken } = useAuth();
  const { toast } = useToast();
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
        const token = await getToken();
        const res = await fetch("/api/settings/ai-intake", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json() as AiIntakeSettingsData;
          setData(json);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/settings/ai-intake", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Pengaturan AI Intake berhasil disimpan" });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
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
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [adminWa, setAdminWa] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/settings/notifications", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json() as { adminWa: string };
          setAdminWa(data.adminWa ?? "");
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ adminWa }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Nomor WhatsApp admin berhasil disimpan" });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
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
          Nomor WhatsApp admin yang menerima notifikasi saat ada order atau dokumen baru.
          Admin akan mendapat pesan otomatis untuk Sales Quotation, Sales Order, Logistik, dan E-commerce Order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-10 w-full max-w-sm bg-muted" />
        ) : (
          <div className="flex flex-col gap-3 max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="admin-wa">Nomor / Group ID WhatsApp Admin</Label>
              <Input
                id="admin-wa"
                value={adminWa}
                onChange={(e) => setAdminWa(e.target.value)}
                placeholder="628xxxxxxxxxx atau 12036xxxxxxxx@g.us"
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Bisa diisi dengan:</p>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  <li>Nomor HP personal: <code>6281234567890</code></li>
                  <li>Group ID WhatsApp: <code>120363xxxxxxxxxx@g.us</code> — agar notifikasi masuk ke <strong>grup admin</strong></li>
                </ul>
                <p className="text-amber-600 dark:text-amber-400">⚠️ Untuk kirim ke grup, isi dengan Group ID (format <code>@g.us</code>), bukan nomor HP.</p>
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

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { data: dbUser, isLoading: dbLoading } = useGetCurrentUser({
    query: {
      enabled: isLoaded && !!user,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    }
  });

  const isLoading = !isLoaded || dbLoading;
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
                      {dbUser?.name || user?.fullName || "Not provided"}
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email Address
                    </label>
                    <div className="p-3 bg-background rounded-md border border-border text-foreground font-medium">
                      {dbUser?.email || user?.primaryEmailAddress?.emailAddress || "Not provided"}
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

          <Card className="col-span-1 md:col-span-3 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl">Authentication</CardTitle>
              <CardDescription>Manage your security settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Clerk Account</p>
                  <p className="text-sm text-muted-foreground">Manage your password, connected accounts, and sessions.</p>
                </div>
                <div className="scale-125 origin-right">
                  <UserButton appearance={{
                    elements: {
                      userButtonBox: "shadow-sm",
                      userButtonTrigger: "focus:shadow-none focus:ring-2 focus:ring-primary rounded-full"
                    }
                  }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
