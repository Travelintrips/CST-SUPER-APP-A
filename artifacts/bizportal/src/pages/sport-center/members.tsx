import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, RefreshCw, Activity, ArrowLeft } from "lucide-react";

type Member = {
  id: string; source_id: number; source_table: string;
  name: string; email: string | null; phone: string | null;
  member_type: string; member_number: string;
  start_date: string | null; end_date: string | null;
  status: string; notes: string | null;
  total_price: string | null; payment_method: string | null; months: number | null;
};

const STATUS_COLOR: Record<string, string> = {
  active:               "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  expired:              "bg-red-900/30 text-red-300 border-red-700",
  suspended:            "bg-yellow-900/30 text-yellow-300 border-yellow-700",
  inactive:             "bg-gray-800/40 text-gray-400 border-gray-600",
  pending_payment:      "bg-orange-900/30 text-orange-300 border-orange-700",
  waiting_confirmation: "bg-blue-900/30 text-blue-300 border-blue-700",
  cancelled:            "bg-red-900/30 text-red-300 border-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  active:               "Aktif",
  expired:              "Expired",
  suspended:            "Suspend",
  inactive:             "Tidak Aktif",
  pending_payment:      "Menunggu Bayar",
  waiting_confirmation: "Menunggu Konfirmasi",
  cancelled:            "Dibatalkan",
};
const MEMBER_TYPE_LABEL: Record<string, string> = {
  gym: "Gym", ap: "AP (Aqua Park)", court: "Lapangan", vip: "VIP",
  swimming: "Renang", badminton: "Badminton", tennis: "Tennis",
  futsal: "Futsal", basketball: "Basket", premium: "Premium", regular: "Regular",
};

export default function SportCenterMembers() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const esRef = useRef<EventSource | null>(null);
  const [realtimeCount, setRealtimeCount] = useState(0);
  const [memberType, setMemberType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", member_type: "gym", start_date: "", end_date: "", notes: "" });

  const { data, isLoading, refetch } = useQuery<{ data: Member[]; total: number }>({
    queryKey: ["sport-center-members", activeCompanyId, memberType, statusFilter, page],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (memberType !== "all") qs.set("memberType", memberType);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      qs.set("page", String(page));
      const r = await fetch(`/api/sport-center/members?${qs}`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
    const es = new EventSource(`/api/sport-center/events${qs}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "connected") return;
        if (ev.entity === "member") {
          qc.invalidateQueries({ queryKey: ["sport-center-members"] });
          setRealtimeCount((c) => c + 1);
        }
      } catch {}
    };
    return () => { es.close(); };
  }, [activeCompanyId, qc]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url = editTarget
        ? `/api/sport-center/members/${editTarget.source_id}`
        : "/api/sport-center/members";
      const method = editTarget ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editTarget ? "Member diperbarui" : "Member ditambahkan" });
      setShowDialog(false); setEditTarget(null);
      setForm({ name: "", email: "", phone: "", member_type: "gym", start_date: "", end_date: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["sport-center-members"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (m: Member) => {
      await fetch(`/api/sport-center/members/${m.source_id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => { toast({ title: "Member dihapus" }); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ["sport-center-members"] }); },
  });

  const openEdit = (m: Member) => {
    setEditTarget(m);
    setForm({ name: m.name, email: m.email ?? "", phone: m.phone ?? "", member_type: m.member_type, start_date: m.start_date ?? "", end_date: m.end_date ?? "", notes: m.notes ?? "" });
    setShowDialog(true);
  };

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/sport-center/dashboard")} className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Users className="h-6 w-6 text-purple-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Members</h1>
              <p className="text-sm text-muted-foreground">Total: {data?.total ?? 0} member</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {realtimeCount > 0 && (
              <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
                <Activity className="h-3 w-3" /> Live
              </Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => { setEditTarget(null); setShowDialog(true); }} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Tambah Member
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={memberType} onValueChange={(v) => { setMemberType(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="gym">Gym</SelectItem>
              <SelectItem value="ap">AP (Aqua Park)</SelectItem>
              <SelectItem value="court">Lapangan</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="swimming">Renang</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="pending_payment">Menunggu Bayar</SelectItem>
              <SelectItem value="waiting_confirmation">Menunggu Konfirmasi</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="suspended">Suspend</SelectItem>
              <SelectItem value="inactive">Tidak Aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["No. Member","Nama","Tipe","Mulai","Selesai","Status","Aksi"].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-xs text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Memuat…</td></tr>
                ) : (data?.data ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Belum ada member</td></tr>
                ) : (data?.data ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{m.member_number}</td>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.phone}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge className="bg-blue-900/30 text-blue-300 border-blue-700 text-xs">
                        {MEMBER_TYPE_LABEL[m.member_type] ?? m.member_type}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{m.start_date}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{m.end_date ?? "—"}</td>
                    <td className="py-2.5 px-3">
                      <Badge className={`text-xs border ${STATUS_COLOR[m.status] ?? "bg-gray-800/40 text-gray-400 border-gray-600"}`}>
                        {STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => setDeleteTarget(m)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editTarget ? "Edit Member" : "Tambah Member"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Nama *</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">No. HP</Label>
                  <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipe Member</Label>
                <Select value={form.member_type} onValueChange={(v) => setForm((p) => ({ ...p, member_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gym">Gym</SelectItem>
                    <SelectItem value="ap">AP (Aqua Park)</SelectItem>
                    <SelectItem value="court">Lapangan</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tanggal Mulai *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tanggal Selesai</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catatan</Label>
                <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
              <Button disabled={!form.name || !form.start_date || saveMutation.isPending} onClick={() => saveMutation.mutate({ ...form, company_id: activeCompanyId })}>
                {saveMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pagination */}
        {(data?.total ?? 0) > 50 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Halaman {page} dari {Math.ceil((data?.total ?? 0) / 50)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
            </div>
          </div>
        )}

        <AlertDialog open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Member?</AlertDialogTitle>
              <AlertDialogDescription>
                Hapus <strong>{deleteTarget?.name}</strong>? Tindakan ini tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>Hapus</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
