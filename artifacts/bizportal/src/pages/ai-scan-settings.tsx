import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ScanLine, Save, Loader2, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "@clerk/react";

type DocGroup = "sales" | "freight" | "customs";

interface FieldDef {
  key: string;
  label: string;
  description: string;
}

interface FieldsResponse {
  fields: Record<DocGroup, FieldDef[]>;
  enabled: Record<DocGroup, Record<string, boolean>>;
}

type EnabledState = Record<DocGroup, Record<string, boolean>>;

const GROUP_LABELS: Record<DocGroup, string> = {
  sales: "Sales / Purchase",
  freight: "Freight / Pengiriman",
  customs: "Bea Cukai",
};

const GROUP_DESCRIPTIONS: Record<DocGroup, string> = {
  sales: "Invoice, Quotation, Purchase Order, dan dokumen transaksi jual-beli",
  freight: "Bill of Lading, Air Waybill, Delivery Order, dan dokumen pengiriman",
  customs: "PIB, PEB, SPPB, NPE, dan dokumen kepabeanan Indonesia",
};

export default function AiScanSettingsPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();

  const [registry, setRegistry] = useState<Record<DocGroup, FieldDef[]> | null>(null);
  const [enabled, setEnabled] = useState<EnabledState>({ sales: {}, freight: {}, customs: {} });
  const [saved, setSaved] = useState<EnabledState>({ sales: {}, freight: {}, customs: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/scan-document/fields", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as FieldsResponse;
      setRegistry(data.fields);
      setEnabled(data.enabled);
      setSaved(JSON.parse(JSON.stringify(data.enabled)) as EnabledState);
    } catch {
      toast({ title: "Gagal memuat pengaturan", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/scan-document/fields", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(enabled),
      });
      if (!res.ok) throw new Error();
      setSaved(JSON.parse(JSON.stringify(enabled)) as EnabledState);
      toast({ title: "Pengaturan berhasil disimpan" });
    } catch {
      toast({ title: "Gagal menyimpan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function toggleField(group: DocGroup, key: string, value: boolean) {
    setEnabled((prev) => ({
      ...prev,
      [group]: { ...prev[group], [key]: value },
    }));
  }

  function selectAll(group: DocGroup, fields: FieldDef[]) {
    const all: Record<string, boolean> = {};
    for (const f of fields) all[f.key] = true;
    setEnabled((prev) => ({ ...prev, [group]: all }));
  }

  function clearAll(group: DocGroup, fields: FieldDef[]) {
    const none: Record<string, boolean> = {};
    for (const f of fields) none[f.key] = false;
    setEnabled((prev) => ({ ...prev, [group]: none }));
  }

  function isGroupDirty(group: DocGroup): boolean {
    const cur = enabled[group];
    const sav = saved[group];
    const keys = registry?.[group]?.map((f) => f.key) ?? [];
    return keys.some((k) => {
      const curVal = cur[k] !== false;
      const savVal = sav[k] !== false;
      return curVal !== savVal;
    });
  }

  const isDirty = (["sales", "freight", "customs"] as DocGroup[]).some(isGroupDirty);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <ScanLine className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pengaturan Scan Dokumen</h1>
            <p className="text-sm text-gray-500">
              Pilih field mana yang diekstrak AI saat memindai dokumen
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-4 bg-violet-50 border border-violet-100 rounded-xl text-sm text-violet-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
          <div className="space-y-1">
            <p className="font-semibold">Cara kerja whitelist field:</p>
            <ul className="list-disc list-inside space-y-0.5 text-violet-700">
              <li>Hanya field yang dicentang yang dikirim ke AI — field tidak aktif tidak diekstrak</li>
              <li>Menonaktifkan field yang tidak perlu mengurangi penggunaan token AI</li>
              <li>Default: semua field aktif (tidak ada perubahan pada perilaku scan yang sudah ada)</li>
              <li>Perubahan berlaku untuk scan berikutnya secara langsung</li>
            </ul>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <Tabs defaultValue="sales">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="sales" className="relative">
                Sales/Purchase
                {isGroupDirty("sales") && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </TabsTrigger>
              <TabsTrigger value="freight" className="relative">
                Freight/Pengiriman
                {isGroupDirty("freight") && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </TabsTrigger>
              <TabsTrigger value="customs" className="relative">
                Bea Cukai
                {isGroupDirty("customs") && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </TabsTrigger>
            </TabsList>

            {(["sales", "freight", "customs"] as DocGroup[]).map((group) => {
              const fields = registry?.[group] ?? [];
              const groupEnabled = enabled[group] ?? {};
              const allChecked = fields.every((f) => groupEnabled[f.key] !== false);
              const noneChecked = fields.every((f) => groupEnabled[f.key] === false);
              const checkedCount = fields.filter((f) => groupEnabled[f.key] !== false).length;

              return (
                <TabsContent key={group} value={group} className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-base">{GROUP_LABELS[group]}</CardTitle>
                          <CardDescription className="mt-0.5">
                            {GROUP_DESCRIPTIONS[group]}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-500">
                            {checkedCount}/{fields.length} aktif
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => allChecked ? clearAll(group, fields) : selectAll(group, fields)}
                          >
                            {allChecked ? "Hapus Semua" : "Pilih Semua"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {fields.map((field) => {
                          const checked = groupEnabled[field.key] !== false;
                          return (
                            <label
                              key={field.key}
                              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(val) =>
                                  toggleField(group, field.key, val === true)
                                }
                                className="mt-0.5 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium leading-tight ${checked ? "text-gray-900" : "text-gray-400"}`}>
                                  {field.label}
                                </p>
                                <p className={`text-xs mt-0.5 leading-snug ${checked ? "text-gray-500" : "text-gray-300"}`}>
                                  {field.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {!isDirty && !loading && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Tersimpan
              </div>
            )}
            {isDirty && (
              <span className="text-xs text-amber-600 font-medium">Ada perubahan belum disimpan</span>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving || loading}
            className="gap-2 bg-violet-600 hover:bg-violet-500"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Simpan Pengaturan
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
