import { useEffect, useState } from "react";
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
import {
  useGetAccountingSettings, useUpdateAccountingSettings, useListAccounts, useListJournals, useListTaxes,
  getGetAccountingSettingsQueryKey,
} from "@workspace/api-client-react";
import type { UpdateAccountingSettingsBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon } from "lucide-react";

type SettingsForm = Required<UpdateAccountingSettingsBody>;

const EMPTY: SettingsForm = {
  arAccountId: null, apAccountId: null, salesIncomeAccountId: null, purchaseExpenseAccountId: null,
  defaultBankAccountId: null, defaultCashAccountId: null,
  ppnOutputAccountId: null, ppnInputAccountId: null,
  inventoryAccountId: null, cogsAccountId: null,
  salesJournalId: null, purchaseJournalId: null,
  bankJournalId: null, cashJournalId: null,
  defaultSalesTaxId: null, defaultPurchaseTaxId: null,
  companyName: null, companyAddress: null, companyNpwp: null,
};

export default function AccountingSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetAccountingSettings();
  const { data: accounts } = useListAccounts();
  const { data: journals } = useListJournals();
  const { data: taxes } = useListTaxes();
  const updateMut = useUpdateAccountingSettings();

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
      });
    }
  }, [settings]);

  const submit = async () => {
    try {
      await updateMut.mutateAsync({ data: form });
      toast({ title: "Pengaturan disimpan" });
      qc.invalidateQueries({ queryKey: getGetAccountingSettingsQueryKey() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
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
