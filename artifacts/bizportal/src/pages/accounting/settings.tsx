import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
  useGetAccountingSettings, useUpdateAccountingSettings, useListAccounts, useListJournals, useListTaxes,
  getGetAccountingSettingsQueryKey,
} from "@workspace/api-client-react";
import type { UpdateAccountingSettingsBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon, Upload, X } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";

type SettingsForm = Required<UpdateAccountingSettingsBody>;

const EMPTY: SettingsForm = {
  arAccountId: null, apAccountId: null, salesIncomeAccountId: null, purchaseExpenseAccountId: null,
  defaultBankAccountId: null, defaultCashAccountId: null,
  ppnOutputAccountId: null, ppnInputAccountId: null,
  inventoryAccountId: null, cogsAccountId: null,
  salesJournalId: null, purchaseJournalId: null,
  bankJournalId: null, cashJournalId: null,
  defaultSalesTaxId: null, defaultPurchaseTaxId: null,
  companyName: null, companyAddress: null, companyNpwp: null, companyLogoUrl: null,
};

function getLogoServeUrl(objectPath: string) {
  if (objectPath.startsWith("/objects/")) return `/api/storage${objectPath}`;
  return objectPath;
}

export default function AccountingSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { activeCompanyId } = useCompany();
  const { data: settings, isLoading } = useGetAccountingSettings({ company: activeCompanyId });
  const { data: accounts } = useListAccounts();
  const { data: journals } = useListJournals();
  const { data: taxes } = useListTaxes();
  const updateMut = useUpdateAccountingSettings();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const { uploadFile } = useUpload({
    onError: (err) => {
      toast({ title: t.common.error, variant: "destructive" });
      setLogoUploading(false);
    },
  });

  const [form, setForm] = useState<SettingsForm>(EMPTY);

  useEffect(() => {
    if (settings) {
      setForm({
        arAccountId: settings.arAccountId ?? null,
        apAccountId: settings.apAccountId ?? null,
        salesIncomeAccountId: settings.salesIncomeAccountId ?? null,
        purchaseExpenseAccountId: settings.purchaseExpenseAccountId ?? null,
        defaultBankAccountId: settings.defaultBankAccountId ?? null,
        defaultCashAccountId: settings.defaultCashAccountId ?? null,
        ppnOutputAccountId: settings.ppnOutputAccountId ?? null,
        ppnInputAccountId: settings.ppnInputAccountId ?? null,
        inventoryAccountId: settings.inventoryAccountId ?? null,
        cogsAccountId: settings.cogsAccountId ?? null,
        salesJournalId: settings.salesJournalId ?? null,
        purchaseJournalId: settings.purchaseJournalId ?? null,
        bankJournalId: settings.bankJournalId ?? null,
        cashJournalId: settings.cashJournalId ?? null,
        defaultSalesTaxId: settings.defaultSalesTaxId ?? null,
        defaultPurchaseTaxId: settings.defaultPurchaseTaxId ?? null,
        companyName: settings.companyName ?? null,
        companyAddress: settings.companyAddress ?? null,
        companyNpwp: settings.companyNpwp ?? null,
        companyLogoUrl: settings.companyLogoUrl ?? null,
      });
    }
  }, [settings]);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const result = await uploadFile(file);
      if (result?.objectPath) {
        setForm((prev) => ({ ...prev, companyLogoUrl: result.objectPath }));
        toast({ title: t.common.success });
      }
    } finally {
      setLogoUploading(false);
    }
  };

  const submit = async () => {
    try {
      await updateMut.mutateAsync({ data: form });
      toast({ title: t.common.success });
      qc.invalidateQueries({ queryKey: getGetAccountingSettingsQueryKey() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: t.common.error, description: msg, variant: "destructive" });
    }
  };

  const accSelect = (key: keyof SettingsForm, label: string, filterType?: string[]) => {
    const list = (accounts ?? []).filter((a) => a.isActive && (!filterType || filterType.includes(a.type)));
    return (
      <div>
        <Label>{label}</Label>
        <Select value={form[key] ? String(form[key]) : "none"} onValueChange={(v) => setForm({ ...form, [key]: v === "none" ? null : parseInt(v) })}>
          <SelectTrigger data-testid={`select-${key}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Tidak ada —</SelectItem>
            {list.map((a) => (<SelectItem key={a.id} value={String(a.id)}>{a.code} {a.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const jSelect = (key: keyof SettingsForm, label: string, type: string) => (
    <div>
      <Label>{label}</Label>
      <Select value={form[key] ? String(form[key]) : "none"} onValueChange={(v) => setForm({ ...form, [key]: v === "none" ? null : parseInt(v) })}>
        <SelectTrigger data-testid={`select-${key}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Tidak ada —</SelectItem>
          {(journals ?? []).filter((j) => j.type === type).map((j) => (<SelectItem key={j.id} value={String(j.id)}>{j.code} - {j.name}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );

  const tSelect = (key: keyof SettingsForm, label: string, kind: string) => (
    <div>
      <Label>{label}</Label>
      <Select value={form[key] ? String(form[key]) : "none"} onValueChange={(v) => setForm({ ...form, [key]: v === "none" ? null : parseInt(v) })}>
        <SelectTrigger data-testid={`select-${key}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Tidak ada —</SelectItem>
          {(taxes ?? []).filter((t) => t.kind === kind && t.isActive).map((t) => (<SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.rate}%)</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );

  if (isLoading) return <AppShell><div className="p-6">Memuat...</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><SettingsIcon className="h-6 w-6" />Pengaturan Akunting</h1>
          <p className="text-sm text-muted-foreground">Mapping akun &amp; jurnal default untuk auto-posting semua modul</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Profil Perusahaan</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Label htmlFor="companyName">Nama Perusahaan</Label>
              <Input
                id="companyName"
                data-testid="input-companyName"
                value={form.companyName ?? ""}
                onChange={(e) => setForm({ ...form, companyName: e.target.value || null })}
                placeholder="Cth. PT Maju Bersama"
              />
            </div>
            <div>
              <Label htmlFor="companyAddress">Alamat Perusahaan</Label>
              <Textarea
                id="companyAddress"
                data-testid="input-companyAddress"
                value={form.companyAddress ?? ""}
                onChange={(e) => setForm({ ...form, companyAddress: e.target.value || null })}
                placeholder="Cth. Jl. Sudirman No. 1, Jakarta Pusat 10220"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="companyNpwp">NPWP Perusahaan</Label>
              <Input
                id="companyNpwp"
                data-testid="input-companyNpwp"
                value={form.companyNpwp ?? ""}
                onChange={(e) => setForm({ ...form, companyNpwp: e.target.value || null })}
                placeholder="Cth. 01.234.567.8-901.000"
              />
            </div>
            <div>
              <Label>Logo Perusahaan</Label>
              <p className="text-xs text-muted-foreground mb-2">Logo akan tampil di header invoice yang dicetak.</p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="input-companyLogo"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = "";
                }}
              />
              {form.companyLogoUrl ? (
                <div className="flex items-start gap-3">
                  <img
                    src={getLogoServeUrl(form.companyLogoUrl)}
                    alt="Logo Perusahaan"
                    className="h-16 w-auto max-w-[200px] rounded border object-contain bg-white"
                    data-testid="preview-companyLogo"
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      data-testid="button-changeLogo"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {logoUploading ? "Mengunggah..." : "Ganti Logo"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setForm((prev) => ({ ...prev, companyLogoUrl: null }))}
                      data-testid="button-removeLogo"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  data-testid="button-uploadLogo"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {logoUploading ? "Mengunggah..." : "Unggah Logo"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Akun Default — Sales &amp; Purchase</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {accSelect("arAccountId", "Piutang Usaha (AR)", ["asset"])}
            {accSelect("apAccountId", "Hutang Usaha (AP)", ["liability"])}
            {accSelect("salesIncomeAccountId", "Pendapatan Penjualan", ["revenue"])}
            {accSelect("purchaseExpenseAccountId", "Beban Pembelian / HPP", ["expense"])}
            {accSelect("ppnOutputAccountId", "PPN Keluaran", ["liability"])}
            {accSelect("ppnInputAccountId", "PPN Masukan", ["asset"])}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Akun Default — Kas, Bank &amp; Persediaan</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {accSelect("defaultBankAccountId", "Bank Default", ["asset"])}
            {accSelect("defaultCashAccountId", "Kas Default (POS tunai/QRIS)", ["asset"])}
            {accSelect("inventoryAccountId", "Persediaan Barang (Trading)", ["asset"])}
            {accSelect("cogsAccountId", "HPP / COGS", ["expense"])}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Jurnal Default</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {jSelect("salesJournalId", "Jurnal Penjualan", "sales")}
            {jSelect("purchaseJournalId", "Jurnal Pembelian", "purchase")}
            {jSelect("bankJournalId", "Jurnal Bank", "bank")}
            {jSelect("cashJournalId", "Jurnal Kas (POS tunai/QRIS)", "cash")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pajak Default</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {tSelect("defaultSalesTaxId", "Pajak Penjualan Default", "sale")}
            {tSelect("defaultPurchaseTaxId", "Pajak Pembelian Default", "purchase")}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={submit} data-testid="button-save-settings">Simpan</Button>
        </div>
      </div>
    </AppShell>
  );
}
