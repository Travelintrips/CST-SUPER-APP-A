import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { getAuthToken, getAuthHeaders } from "@/lib/auth";
import { useGetPortalMe } from "@workspace/api-client-react";
import {
  Building2, Mail, Phone, User, MapPin, Shield,
  Edit2, Save, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function CompanyProfile() {
  const [, setLocation] = useLocation();
  const token = getAuthToken();
  const headers = getAuthHeaders() as Record<string, string>;
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const { data: profile, isLoading, refetch } = useGetPortalMe({
    query: { queryKey: ["getPortalMe", token], enabled: !!token },
    request: { headers },
  });

  const [form, setForm] = useState({ name: "", company: "", phone: "", address: "" });

  useEffect(() => {
    if (profile) {
      setForm({
        name:    profile.name    ?? "",
        company: profile.company ?? "",
        phone:   profile.phone   ?? "",
        address: (profile as Record<string, unknown>).address as string ?? "",
      });
    }
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch("/api/portal/me", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        toast({ title: "Profil berhasil disimpan" });
        setEditing(false);
        refetch();
      } else {
        toast({ title: "Gagal menyimpan", variant: "destructive" });
      }
    } catch {
      toast({ title: "Gagal menyimpan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!token) return null;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 py-8">
      <div className="container px-4 md:px-6 max-w-3xl">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Profil Perusahaan</h1>
            <p className="text-slate-500 mt-1">Kelola informasi perusahaan dan akun Anda</p>
          </div>
          {!editing ? (
            <Button variant="outline" className="gap-2" onClick={() => setEditing(true)}>
              <Edit2 className="h-4 w-4" /> Edit Profil
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" className="gap-2" onClick={() => setEditing(false)}>
                <X className="h-4 w-4" /> Batal
              </Button>
              <Button className="gap-2" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-5">

            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-sky-600" /> Informasi Perusahaan
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Nama Kontak
                  </Label>
                  {editing ? (
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  ) : (
                    <p className="font-medium text-slate-800">{profile?.name || "—"}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Nama Perusahaan
                  </Label>
                  {editing ? (
                    <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
                  ) : (
                    <p className="font-medium text-slate-800">{profile?.company || "—"}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </Label>
                  <p className="font-medium text-slate-800">{profile?.email}</p>
                  <p className="text-xs text-slate-400">Email tidak dapat diubah</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> No. Telepon / WhatsApp
                  </Label>
                  {editing ? (
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+62..." />
                  ) : (
                    <p className="font-medium text-slate-800">{profile?.phone || "—"}</p>
                  )}
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Alamat
                  </Label>
                  {editing ? (
                    <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Alamat perusahaan..." />
                  ) : (
                    <p className="font-medium text-slate-800">{(profile as Record<string, unknown> | undefined)?.address as string || "—"}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-sky-600" /> Keamanan Akun
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500 mb-4">
                  Kelola password, verifikasi dua langkah, dan sesi aktif Anda.
                </p>
                <Link href="/account-security">
                  <Button variant="outline" className="gap-2">
                    <Shield className="h-4 w-4" /> Pengaturan Keamanan
                  </Button>
                </Link>
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </div>
  );
}
