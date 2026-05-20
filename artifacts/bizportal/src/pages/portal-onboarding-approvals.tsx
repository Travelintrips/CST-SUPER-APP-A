import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Clock, CheckCircle2, XCircle, Users, ChevronDown, ChevronRight,
  Building2, Truck, UserCheck, User, Phone, Mail, MapPin, FileText,
  Eye, AlertCircle, RefreshCw, CreditCard, Car,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

type UserProfile = {
  id: number;
  fullName: string | null;
  phone: string | null;
  address: string | null;
  accountType: string;
  status: string;
  ktpUrl: string | null;
  rejectionReason: string | null;
  completedAt: string | null;
};

type VendorProfile = { companyName: string | null; nib: string | null; npwp: string | null; serviceType: string | null };
type DriverProfile = { licenseNumber: string | null; vehicleType: string | null; plateNumber: string | null; simUrl: string | null; stnkUrl: string | null };
type EmployeeProfile = { companyName: string | null; branch: string | null; department: string | null; division: string | null; position: string | null };

type ApprovalItem = {
  id: number;
  customerId: number;
  accountType: string;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  userProfile: UserProfile | null;
  typeProfile: VendorProfile | DriverProfile | EmployeeProfile | null;
};

type Stats = { pending: number; approved: number; rejected: number; total: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (s: string | null) => s ? new Date(s).toLocaleString("id-ID") : "-";

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Disetujui</Badge>;
  if (s === "rejected") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Ditolak</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Menunggu</Badge>;
};

const accountTypeLabel = (t: string) => ({
  vendor: "Vendor", driver: "Driver", employee: "Karyawan", customer: "Customer",
}[t] ?? t);

const accountTypeIcon = (t: string) => {
  if (t === "vendor") return <Building2 className="h-4 w-4 text-blue-600" />;
  if (t === "driver") return <Truck className="h-4 w-4 text-orange-600" />;
  if (t === "employee") return <UserCheck className="h-4 w-4 text-purple-600" />;
  return <User className="h-4 w-4 text-gray-500" />;
};

const accountTypeBadge = (t: string) => {
  const colors: Record<string, string> = {
    vendor: "bg-blue-100 text-blue-800 border-blue-200",
    driver: "bg-orange-100 text-orange-800 border-orange-200",
    employee: "bg-purple-100 text-purple-800 border-purple-200",
    customer: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <Badge className={`${colors[t] ?? "bg-gray-100 text-gray-700"} text-xs flex items-center gap-1`}>
      {accountTypeIcon(t)} {accountTypeLabel(t)}
    </Badge>
  );
};

// ── Detail Section ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground min-w-[140px] shrink-0">{label}</span>
      <span className="font-medium break-all">{value || <span className="text-muted-foreground italic">—</span>}</span>
    </div>
  );
}

function TypeProfileDetail({ accountType, profile }: { accountType: string; profile: unknown }) {
  if (!profile) return <p className="text-sm text-muted-foreground italic">Data profil tidak tersedia</p>;

  if (accountType === "vendor") {
    const vp = profile as VendorProfile;
    return (
      <div className="space-y-2">
        <InfoRow label="Nama Perusahaan" value={vp.companyName} />
        <InfoRow label="NIB" value={vp.nib} />
        <InfoRow label="NPWP" value={vp.npwp} />
        <InfoRow label="Jenis Layanan" value={vp.serviceType} />
      </div>
    );
  }
  if (accountType === "driver") {
    const dp = profile as DriverProfile;
    return (
      <div className="space-y-2">
        <InfoRow label="No. SIM" value={dp.licenseNumber} />
        <InfoRow label="Jenis Kendaraan" value={dp.vehicleType} />
        <InfoRow label="No. Plat" value={dp.plateNumber} />
        {dp.simUrl && (
          <div className="flex gap-2 text-sm items-center">
            <span className="text-muted-foreground min-w-[140px]">Foto SIM</span>
            <a href={dp.simUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1">
              <Eye className="h-3 w-3" /> Lihat Dokumen
            </a>
          </div>
        )}
        {dp.stnkUrl && (
          <div className="flex gap-2 text-sm items-center">
            <span className="text-muted-foreground min-w-[140px]">Foto STNK</span>
            <a href={dp.stnkUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1">
              <Eye className="h-3 w-3" /> Lihat Dokumen
            </a>
          </div>
        )}
      </div>
    );
  }
  if (accountType === "employee") {
    const ep = profile as EmployeeProfile;
    return (
      <div className="space-y-2">
        <InfoRow label="Perusahaan" value={ep.companyName} />
        <InfoRow label="Cabang" value={ep.branch} />
        <InfoRow label="Departemen" value={ep.department} />
        <InfoRow label="Divisi" value={ep.division} />
        <InfoRow label="Jabatan" value={ep.position} />
      </div>
    );
  }
  return null;
}

// ── Detail Dialog ─────────────────────────────────────────────────────────────

function DetailDialog({
  item,
  open,
  onClose,
  onApprove,
  onReject,
  isActing,
}: {
  item: ApprovalItem;
  open: boolean;
  onClose: () => void;
  onApprove: (id: number, note: string, by: string) => void;
  onReject: (id: number, note: string, by: string) => void;
  isActing: boolean;
}) {
  const [note, setNote] = useState(item.adminNote ?? "");
  const [reviewedBy, setReviewedBy] = useState("");
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const up = item.userProfile;
  const isPending = item.status === "pending";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {accountTypeIcon(item.accountType)}
            Permohonan Akun — {accountTypeLabel(item.accountType)}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {statusBadge(item.status)}
            <span className="text-xs text-muted-foreground">Diajukan {fmt(item.createdAt)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">

          {/* Personal Info */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <User className="h-4 w-4" /> Informasi Pribadi
            </h4>
            <div className="space-y-2 bg-muted/30 rounded-lg p-3">
              <InfoRow label="Nama Lengkap" value={up?.fullName ?? item.customerName} />
              <InfoRow label="Email" value={
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  {item.customerEmail}
                </span>
              } />
              <InfoRow label="Telepon" value={
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {up?.phone ?? item.customerPhone}
                </span>
              } />
              <InfoRow label="Alamat" value={
                <span className="flex items-start gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                  {up?.address}
                </span>
              } />
              <InfoRow label="Tanggal Submit" value={fmt(up?.completedAt ?? null)} />
            </div>
          </div>

          {/* KTP */}
          {up?.ktpUrl ? (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Foto KTP
              </h4>
              <div className="rounded-lg overflow-hidden border bg-muted/20">
                <img
                  src={up.ktpUrl}
                  alt="KTP"
                  className="w-full max-h-52 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="p-2 text-center">
                  <a href={up.ktpUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1">
                    <Eye className="h-3 w-3" /> Buka di tab baru
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/20 rounded-lg p-3">
              <CreditCard className="h-4 w-4" />
              Foto KTP belum diunggah
            </div>
          )}

          {/* Type-specific */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              {item.accountType === "vendor" && <Building2 className="h-4 w-4" />}
              {item.accountType === "driver" && <Car className="h-4 w-4" />}
              {item.accountType === "employee" && <UserCheck className="h-4 w-4" />}
              Data {accountTypeLabel(item.accountType)}
            </h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <TypeProfileDetail accountType={item.accountType} profile={item.typeProfile} />
            </div>
          </div>

          {/* Review result (if already reviewed) */}
          {!isPending && (
            <div className={`rounded-lg p-3 space-y-2 text-sm ${item.status === "approved" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center gap-2 font-medium">
                {item.status === "approved"
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <XCircle className="h-4 w-4 text-red-600" />}
                {item.status === "approved" ? "Disetujui" : "Ditolak"} oleh {item.reviewedBy ?? "Admin"}
              </div>
              <div className="text-muted-foreground">Waktu: {fmt(item.reviewedAt)}</div>
              {item.adminNote && <div>Catatan: <span className="font-medium">{item.adminNote}</span></div>}
            </div>
          )}

          {/* Action form (only pending) */}
          {isPending && (
            <>
              <Separator />
              {confirmAction ? (
                <div className={`rounded-lg p-4 space-y-3 ${confirmAction === "approve" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <p className="text-sm font-semibold">
                    {confirmAction === "approve"
                      ? "✅ Konfirmasi Persetujuan"
                      : "❌ Konfirmasi Penolakan"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {confirmAction === "approve"
                      ? `Akun ${accountTypeLabel(item.accountType)} untuk ${up?.fullName ?? item.customerName} akan diaktifkan.`
                      : `Permohonan akun ${accountTypeLabel(item.accountType)} untuk ${up?.fullName ?? item.customerName} akan ditolak.`}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAction(null)}
                      disabled={isActing}
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      className={confirmAction === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                      onClick={() => {
                        if (confirmAction === "approve") onApprove(item.id, note, reviewedBy);
                        else onReject(item.id, note, reviewedBy);
                      }}
                      disabled={isActing}
                    >
                      {isActing ? "Memproses..." : (confirmAction === "approve" ? "Ya, Setujui" : "Ya, Tolak")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Review & Keputusan</h4>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Catatan Admin (opsional)</label>
                    <Textarea
                      placeholder="Catatan keputusan..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Direview oleh</label>
                    <Input
                      placeholder="Nama reviewer..."
                      value={reviewedBy}
                      onChange={(e) => setReviewedBy(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {isPending && !confirmAction && (
          <DialogFooter className="flex gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>Tutup</Button>
            <Button
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-50"
              onClick={() => setConfirmAction("reject")}
            >
              <XCircle className="h-4 w-4 mr-1" /> Tolak
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setConfirmAction("approve")}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Setujui
            </Button>
          </DialogFooter>
        )}
        {(!isPending || confirmAction) && !isActing && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Tutup</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function PortalOnboardingApprovalsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("accountType", typeFilter);

  const { data = [], isLoading, refetch } = useQuery<ApprovalItem[]>({
    queryKey: ["portal-onboarding-approvals", statusFilter, typeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/portal/admin/approvals?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const { data: stats = { pending: 0, approved: 0, rejected: 0, total: 0 } } = useQuery<Stats>({
    queryKey: ["portal-onboarding-approvals-stats"],
    queryFn: async () => {
      const res = await fetch("/api/portal/admin/approvals/stats");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal-onboarding-approvals"] });
    qc.invalidateQueries({ queryKey: ["portal-onboarding-approvals-stats"] });
  };

  const actMutation = useMutation({
    mutationFn: async ({ id, status, adminNote, reviewedBy }: { id: number; status: string; adminNote: string; reviewedBy: string }) => {
      const res = await fetch(`/api/portal/admin/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: adminNote || undefined, reviewedBy: reviewedBy || "Admin" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.status === "approved" ? "✅ Akun disetujui" : "❌ Permohonan ditolak" });
      invalidate();
      setSelectedItem(null);
    },
    onError: (e) => toast({ title: "Gagal memproses", description: String((e as Error).message), variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" /> Persetujuan Onboarding Portal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review dan setujui permohonan akun vendor, driver, dan karyawan dari Customer Portal
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <Clock className="h-8 w-8 text-amber-500 shrink-0" />
              <div>
                <div className="text-2xl font-bold text-amber-700">{stats.pending}</div>
                <div className="text-xs text-amber-600">Menunggu Review</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
              <div>
                <div className="text-2xl font-bold text-green-700">{stats.approved}</div>
                <div className="text-xs text-green-600">Disetujui</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <XCircle className="h-8 w-8 text-red-500 shrink-0" />
              <div>
                <div className="text-2xl font-bold text-red-700">{stats.rejected}</div>
                <div className="text-xs text-red-600">Ditolak</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Permohonan</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap gap-4 p-4 items-end">
            <div className="w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="approved">Disetujui</SelectItem>
                  <SelectItem value="rejected">Ditolak</SelectItem>
                  <SelectItem value="all">Semua</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipe Akun</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tipe</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="employee">Karyawan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {stats.pending > 0 && statusFilter !== "pending" && (
              <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4" />
                {stats.pending} permohonan belum direview
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Daftar Permohonan
              {data.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">({data.length} data)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Memuat data...
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                Tidak ada permohonan
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Tipe Akun</TableHead>
                      <TableHead>Perusahaan / Kendaraan</TableHead>
                      <TableHead>Tanggal Daftar</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((item) => {
                      const up = item.userProfile;
                      const extraInfo =
                        item.accountType === "vendor" ? (item.typeProfile as VendorProfile)?.companyName :
                        item.accountType === "driver" ? (item.typeProfile as DriverProfile)?.plateNumber :
                        item.accountType === "employee" ? (item.typeProfile as EmployeeProfile)?.companyName :
                        null;

                      return (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground text-xs pl-4">{item.id}</TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{up?.fullName ?? item.customerName ?? "—"}</div>
                            {up?.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{up.phone}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">{item.customerEmail ?? "—"}</div>
                          </TableCell>
                          <TableCell>{accountTypeBadge(item.accountType)}</TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">{extraInfo ?? "—"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{fmt(item.createdAt)}</div>
                          </TableCell>
                          <TableCell>{statusBadge(item.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedItem(item)}
                            >
                              <Eye className="h-3 w-3 mr-1" /> Detail
                              {item.status === "pending" && (
                                <span className="ml-1 h-2 w-2 rounded-full bg-amber-400 inline-block"></span>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      {selectedItem && (
        <DetailDialog
          item={selectedItem}
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onApprove={(id, note, by) => actMutation.mutate({ id, status: "approved", adminNote: note, reviewedBy: by })}
          onReject={(id, note, by) => actMutation.mutate({ id, status: "rejected", adminNote: note, reviewedBy: by })}
          isActing={actMutation.isPending}
        />
      )}
    </AppShell>
  );
}
