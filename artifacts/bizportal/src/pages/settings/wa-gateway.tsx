import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Send, RefreshCw,
  Wifi, WifiOff, MessageCircle, Info, AlertTriangle, Smartphone,
  ExternalLink, Eye, EyeOff, BookOpen, Terminal, QrCode, Key, Hash,
} from "lucide-react";
import { Link } from "wouter";

const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`/api${path}`, { credentials: "include", ...opts });

interface GatewayStatus {
  configured: boolean;
  provider: string;
  gatewayUrl?: string | null;
  deviceId?: number | null;
  deviceStatus?: "connected" | "disconnected" | "connecting" | null;
  deviceName?: string | null;
  error?: string | null;
}

function StatusBadge({ status }: { status: GatewayStatus }) {
  if (!status.configured) {
    return (
      <Badge className="gap-1 bg-muted text-muted-foreground border">
        <AlertTriangle size={12} /> Belum dikonfigurasi
      </Badge>
    );
  }
  if (status.deviceStatus === "connected") {
    return (
      <Badge className="gap-1 bg-emerald-600/20 text-emerald-400 border-emerald-600">
        <Wifi size={12} /> Device terhubung
      </Badge>
    );
  }
  if (status.deviceStatus === "disconnected") {
    return (
      <Badge className="gap-1 bg-red-600/20 text-red-400 border-red-600">
        <WifiOff size={12} /> Device terputus
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-amber-600/20 text-amber-400 border-amber-600">
      <Loader2 size={12} className="animate-spin" /> Mengecek...
    </Badge>
  );
}

interface SettingRow {
  key: string;
  label: string;
  description: string;
  sensitive?: boolean;
  placeholder?: string;
  type?: "url" | "number" | "text";
}

const SETTINGS: SettingRow[] = [
  {
    key: "wa_gateway_url",
    label: "WA Gateway URL",
    description: "Base URL WA Gateway built-in ini. Klik \"Auto-isi\" di bawah untuk mengisi otomatis.",
    placeholder: window.location.origin,
    type: "url",
  },
  {
    key: "wa_gateway_api_key",
    label: "API Key",
    description: "API key bertipe wag_xxx — buat di dashboard WA Gateway → API Keys",
    placeholder: "wag_xxxxxxxxxxxxxxxxxxxxxxxx",
    sensitive: true,
  },
  {
    key: "wa_gateway_device_id",
    label: "Device ID",
    description: "ID device WA yang sudah terhubung (angka, lihat di dashboard WA Gateway → Devices)",
    placeholder: "1",
    type: "number",
  },
];

function SettingField({ setting, onSaved }: { setting: SettingRow; onSaved: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: current, refetch } = useQuery<{ hasValue: boolean; maskedValue: string; source: string }>({
    queryKey: ["secret", setting.key],
    queryFn: async () => {
      const res = await apiFetch(`/settings/secrets/${setting.key}`);
      if (!res.ok) return { hasValue: false, maskedValue: "", source: "" };
      return res.json();
    },
  });

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/settings/secrets/${setting.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Tersimpan", description: setting.label });
      setValue("");
      setEditing(false);
      await refetch();
      onSaved();
    } catch (e) {
      toast({ title: "Gagal simpan", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await apiFetch(`/settings/secrets/${setting.key}`, { method: "DELETE" });
      toast({ title: "Dihapus", description: setting.label });
      setEditing(false);
      await refetch();
      onSaved();
    } catch {
      toast({ title: "Gagal hapus", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const hasValue = current?.hasValue;
  const source = current?.source;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{setting.label}</Label>
        {hasValue && (
          <Badge variant="outline" className={`text-xs ${source === "db" ? "border-green-500/50 text-green-600" : "border-blue-500/50 text-blue-600"}`}>
            {source === "db" ? "DB" : "Env"}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{setting.description}</p>
      {hasValue && !editing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 font-mono text-sm bg-muted rounded px-3 py-1.5 min-h-[36px] flex items-center">
            {current?.maskedValue}
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Ubah</Button>
          {source === "db" && (
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-500" onClick={handleDelete} disabled={saving}>
              Hapus
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={setting.sensitive && !show ? "password" : "text"}
              placeholder={setting.placeholder}
              value={value}
              onChange={e => setValue(e.target.value)}
              className="pr-9 font-mono text-sm"
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            {setting.sensitive && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShow(v => !v)}
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
          <Button size="sm" onClick={handleSave} disabled={!value.trim() || saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Simpan"}
          </Button>
          {editing && (
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(""); }}>
              Batal
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function WaGatewaySettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  const { data: status, isLoading, refetch } = useQuery<GatewayStatus>({
    queryKey: ["wa-gateway-status"],
    queryFn: async () => {
      const res = await apiFetch("/settings/wa-gateway/status");
      if (!res.ok) return { configured: false, provider: "fonnte" };
      return res.json();
    },
    refetchInterval: 30_000,
  });

  function onSaved() {
    queryClient.invalidateQueries({ queryKey: ["wa-gateway-status"] });
    refetch();
  }

  async function handleTest() {
    if (!testPhone.trim()) return;
    setTesting(true);
    try {
      const res = await apiFetch("/settings/wa-gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? "Gagal kirim");
      toast({
        title: "Pesan terkirim!",
        description: `Test WA berhasil dikirim ke ${testPhone}`,
      });
    } catch (e) {
      toast({ title: "Gagal test", description: String(e), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AppShell title="WA Gateway Settings" breadcrumbs={[
      { label: "Settings", href: "/settings" },
      { label: "WA Gateway" },
    ]}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">WA Gateway (Baileys)</h1>
            <p className="text-sm text-muted-foreground">
              Kirim notifikasi ERP lewat device WhatsApp sendiri — tanpa biaya per pesan.
            </p>
          </div>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone size={16} className="text-emerald-500" />
                Status
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="h-8 bg-muted animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <StatusBadge status={status!} />
                  {status?.configured && (
                    <span className="text-sm text-muted-foreground">
                      Device #{status.deviceId}
                      {status.deviceName ? ` — ${status.deviceName}` : ""}
                    </span>
                  )}
                </div>
                {!status?.configured && (
                  <div className="flex items-start gap-2 p-3 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      Isi ketiga konfigurasi di bawah untuk mengaktifkan WA Gateway.
                      Jika tidak dikonfigurasi, notifikasi tetap dikirim via <strong>Fonnte</strong>.
                    </span>
                  </div>
                )}
                {status?.error && (
                  <div className="flex items-start gap-2 p-3 rounded bg-red-500/10 text-red-500 dark:text-red-400 text-sm">
                    <XCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{status.error}</span>
                  </div>
                )}
                {status?.configured && status?.deviceStatus === "connected" && (
                  <div className="flex items-start gap-2 p-3 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                    <span>
                      WA Gateway aktif. Semua notifikasi ERP akan dikirim lewat device ini.
                      Fonnte hanya dipakai sebagai <em>fallback</em> jika gateway gagal.
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Config Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konfigurasi</CardTitle>
            <CardDescription>
              Isi ketiga kolom berikut. Nilai disimpan di database dan dapat diubah tanpa restart server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {SETTINGS.map(s => (
              <div key={s.key}>
                <SettingField setting={s} onSaved={onSaved} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dashboard Link */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dashboard WA Gateway</CardTitle>
            <CardDescription>
              Buka dashboard WA Gateway untuk scan QR, lihat devices, dan kelola API keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.open("/wa-gateway/", "_blank")}
            >
              <ExternalLink size={14} />
              Buka Dashboard WA Gateway
            </Button>
          </CardContent>
        </Card>

        {/* Setup Guide */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen size={16} className="text-blue-400" />
              Panduan Setup WA Gateway
            </CardTitle>
            <CardDescription>
              WA Gateway sudah <strong>built-in</strong> di sistem ini — tidak perlu Docker atau server eksternal.
              Ikuti langkah berikut untuk mengaktifkannya.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">

            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">1</span>
                <ExternalLink size={14} className="text-muted-foreground" />
                Buka Dashboard WA Gateway
              </div>
              <div className="ml-7 space-y-2">
                <p className="text-muted-foreground text-xs">Klik tombol di bawah (atau di card Dashboard di atas) untuk membuka dashboard:</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs"
                  onClick={() => window.open("/wa-gateway/", "_blank")}
                >
                  <ExternalLink size={12} />
                  Buka /wa-gateway/
                </Button>
                <p className="text-xs text-muted-foreground">Daftar akun baru jika belum punya (klik <strong className="text-foreground">Register</strong>).</p>
              </div>
            </div>

            <Separator />

            {/* Step 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">2</span>
                <QrCode size={14} className="text-muted-foreground" />
                Tambah Device &amp; Scan QR
              </div>
              <div className="ml-7 space-y-1.5">
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal ml-4">
                  <li>Di dashboard, klik <strong className="text-foreground">Add Device</strong></li>
                  <li>Beri nama device (contoh: "WA BizPortal"), klik <strong className="text-foreground">Create</strong></li>
                  <li>Klik <strong className="text-foreground">Manage</strong> pada device yang dibuat</li>
                  <li>Klik <strong className="text-foreground">Connect</strong> → QR code akan muncul</li>
                  <li>Scan QR dengan WhatsApp di HP (<em>Linked Devices → Link a Device</em>)</li>
                  <li>Tunggu status berubah menjadi <strong className="text-emerald-400">connected</strong></li>
                  <li>Catat <strong className="text-foreground">Device ID</strong> (angka di URL atau info device)</li>
                </ol>
              </div>
            </div>

            <Separator />

            {/* Step 3 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">3</span>
                <Key size={14} className="text-muted-foreground" />
                Buat API Key
              </div>
              <div className="ml-7 space-y-1.5">
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal ml-4">
                  <li>Di dashboard, buka menu <strong className="text-foreground">API Keys</strong></li>
                  <li>Klik <strong className="text-foreground">Create API Key</strong></li>
                  <li>Salin key yang dihasilkan (format <code className="bg-muted px-1 rounded">wag_xxx...</code>)</li>
                </ol>
              </div>
            </div>

            <Separator />

            {/* Step 4 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">4</span>
                <Hash size={14} className="text-muted-foreground" />
                Isi form Konfigurasi di atas
              </div>
              <div className="ml-7">
                <div className="rounded-lg border border-border overflow-hidden text-xs">
                  <div className="grid grid-cols-[120px_1fr] divide-y divide-border">
                    <div className="bg-muted/60 px-3 py-2 font-medium text-foreground">WA Gateway URL</div>
                    <div className="px-3 py-2 text-muted-foreground font-mono break-all">{window.location.origin}</div>
                    <div className="bg-muted/60 px-3 py-2 font-medium text-foreground">API Key</div>
                    <div className="px-3 py-2 text-muted-foreground font-mono">wag_xxx... (dari step 3)</div>
                    <div className="bg-muted/60 px-3 py-2 font-medium text-foreground">Device ID</div>
                    <div className="px-3 py-2 text-muted-foreground font-mono">angka ID device (dari step 2)</div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Info box */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              <span>
                WA Gateway sudah berjalan di sistem ini. URL yang perlu diisi adalah <strong>{window.location.origin}</strong>.
                Jika gateway gagal kirim, notifikasi otomatis <strong>fallback ke Fonnte</strong>.
              </span>
            </div>

          </CardContent>
        </Card>

        {/* Test Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send size={14} />
              Kirim Pesan Test
            </CardTitle>
            <CardDescription>
              Kirim pesan WA percobaan untuk memverifikasi konfigurasi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Nomor WA (contoh: 6281234567890)"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                className="font-mono"
                disabled={!status?.configured || testing}
              />
              <Button
                onClick={handleTest}
                disabled={!testPhone.trim() || !status?.configured || testing}
                className="gap-2 shrink-0"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Test
              </Button>
            </div>
            {!status?.configured && (
              <p className="text-xs text-muted-foreground mt-2">
                Konfigurasi WA Gateway terlebih dahulu untuk mengirim pesan test.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
