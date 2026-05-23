import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { useCompany, type Company } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Pencil, Save, X, CheckCircle2, AlertCircle, Layers, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface HoldingGroup {
  id: number;
  holding_name: string;
  holding_code: string;
  description: string | null;
  members: { companyId: number; companyName: string; companyCode: string }[];
}

const COMPANY_COLORS = [
  "from-indigo-600 to-indigo-800",
  "from-emerald-600 to-emerald-800",
  "from-amber-600 to-amber-800",
  "from-rose-600 to-rose-800",
];

export default function HoldingPage() {
  const { companies, refetch } = useCompany();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);

  const { data: groups = [] } = useQuery<HoldingGroup[]>({
    queryKey: ["holding-groups"],
    queryFn: async () => {
      const r = await fetch("/api/accounting/holding/groups", { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat grup");
      return r.json();
    },
  });

  const startEdit = (c: Company) => {
    setEditing(c.id);
    setForm({ ...c });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({});
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          companyCode: form.companyCode,
          address: form.address,
          phone: form.phone,
          email: form.email,
          npwp: form.npwp,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      toast({ title: "Berhasil", description: "Data perusahaan diperbarui." });
      setEditing(null);
      setForm({});
      refetch();
    } catch {
      toast({ title: "Error", description: "Gagal menyimpan data perusahaan.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30">
            <Building2 className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Holding — Manajemen Perusahaan</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Kelola profil dan pengaturan semua entitas dalam grup
            </p>
          </div>
        </div>

        {/* Holding Groups — Laporan Keuangan */}
        {groups.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Grup Holding</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {groups.map((g) => (
                <Card key={g.id} className="border-border hover:border-indigo-500/40 transition-colors">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30">
                      <Layers className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{g.holding_name}</span>
                        <Badge className="bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 text-xs font-mono">
                          {g.holding_code}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {g.members.length} entitas anggota
                        {g.description ? ` · ${g.description}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"
                      onClick={() => navigate(`/holding/groups/${g.id}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Detail Laporan
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Company Cards */}
        {companies.length === 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">Data perusahaan belum dimuat. Pastikan Anda sudah login sebagai admin.</span>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {companies.map((company, idx) => {
            const isEditing = editing === company.id;
            const color = COMPANY_COLORS[idx % COMPANY_COLORS.length];

            return (
              <Card key={company.id} className="border-border relative overflow-hidden">
                {/* Top gradient stripe */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${color}`} />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white text-sm font-bold shadow-sm`}>
                        {company.companyCode.slice(0, 3)}
                      </div>
                      <div>
                        <CardTitle className="text-base leading-tight">
                          {isEditing ? (
                            <Input
                              value={form.companyName ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                              className="h-7 text-sm px-2 py-0"
                            />
                          ) : company.companyName}
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {isEditing ? (
                            <Input
                              value={form.companyCode ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, companyCode: e.target.value }))}
                              className="h-6 text-xs px-2 py-0 w-24 mt-1"
                              maxLength={8}
                            />
                          ) : (
                            <span>Kode: <span className="font-mono font-semibold text-foreground">{company.companyCode}</span></span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={company.isActive ? "default" : "secondary"} className="text-xs h-5">
                        {company.isActive ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" />Aktif</>
                        ) : "Nonaktif"}
                      </Badge>
                      {!isEditing && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(company)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <FieldRow
                      label="NPWP"
                      value={isEditing ? form.npwp ?? "" : company.npwp ?? "—"}
                      editing={isEditing}
                      onChange={(v) => setForm((f) => ({ ...f, npwp: v }))}
                      placeholder="00.000.000.0-000.000"
                    />
                    <FieldRow
                      label="Telepon"
                      value={isEditing ? form.phone ?? "" : company.phone ?? "—"}
                      editing={isEditing}
                      onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                      placeholder="+62xxx"
                    />
                    <FieldRow
                      label="Email"
                      value={isEditing ? form.email ?? "" : company.email ?? "—"}
                      editing={isEditing}
                      onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                      placeholder="info@perusahaan.co.id"
                      colSpan
                    />
                    <FieldRow
                      label="Alamat"
                      value={isEditing ? form.address ?? "" : company.address ?? "—"}
                      editing={isEditing}
                      onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                      placeholder="Jl. ..."
                      colSpan
                    />
                  </div>

                  {isEditing && (
                    <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                        <X className="h-3.5 w-3.5 mr-1" /> Batal
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(company.id)} disabled={saving}>
                        <Save className="h-3.5 w-3.5 mr-1" />
                        {saving ? "Menyimpan..." : "Simpan"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function FieldRow({
  label,
  value,
  editing,
  onChange,
  placeholder,
  colSpan,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  colSpan?: boolean;
}) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-xs px-2 py-0 mt-0.5"
        />
      ) : (
        <p className="text-xs font-medium mt-0.5 truncate">{value}</p>
      )}
    </div>
  );
}
